/**
 * Fastify application factory.
 *
 * Separated from server.ts so integration tests can import buildApp()
 * without spawning a listener.
 */

import Fastify, { type FastifyInstance, type FastifyBaseLogger, type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Redis } from 'ioredis';
import { authMiddleware } from '@arcane/auth';
import type { DbPool } from '@arcane/core';
import type { ApiConfig } from '@arcane/config';
import type { JetStreamClient } from 'nats';
import {
  collectPrometheusMetrics,
  apiRequestCounter,
  apiRequestDuration,
  rateLimitCounter,
} from '@arcane/telemetry';

/** Internal type for the decorated Fastify instance after authMiddleware is registered */
interface ArcaneApp extends FastifyInstance {
  requireAuth: () => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export interface AppDependencies {
  db: DbPool;
  js?: JetStreamClient; // optional: absent in test / pre-NATS startup
}

export async function buildApp(
  config: ApiConfig,
  logger: FastifyBaseLogger,
  deps: AppDependencies,
): Promise<FastifyInstance> {
  const { db, js } = deps;
  const app = Fastify({
    logger,
    genReqId: () => crypto.randomUUID(),
    requestIdLogLabel: 'request_id',
  });

  // ─── Security ────────────────────────────────────────────────────────────────
  await app.register(helmet, {
    // CSP is enforced at the edge / dashboard level; API returns JSON only
    contentSecurityPolicy: false,
  });

  // CORS_ORIGINS is already string[] (transformed by Zod)
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
  });

  // ─── Rate limiting ────────────────────────────────────────────────────────────
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_GLOBAL_RPM,
    timeWindow: '1 minute',
    // Key: prefer API key prefix, fall back to IP
    keyGenerator: (req) =>
      (req.headers['x-api-key'] as string | undefined)?.slice(0, 16) ?? req.ip,
    errorResponseBuilder: (req, context) => {
      // Increment rate limit metric
      rateLimitCounter.add(1, {
        'rate_limit.key_type':
          req.headers['x-api-key'] ? 'api_key' : 'ip',
      });
      return {
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded. Retry after ${String(context.after)}.`,
          request_id: crypto.randomUUID(),
        },
      };
    },
  });

  // ─── OpenAPI docs ─────────────────────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Arcane API',
        description:
          'Secure execution layer for AI agents. Authenticate, authorize, and execute tools on behalf of users.',
        version: '0.1.0',
        license: { name: 'Apache-2.0' },
      },
      components: {
        securitySchemes: {
          ApiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Api-Key',
          },
          Bearer: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ ApiKey: [] }],
      tags: [
        { name: 'health', description: 'Liveness and readiness probes' },
        { name: 'sessions', description: 'Session management' },
        { name: 'connections', description: 'User connections (OAuth/API key)' },
        { name: 'tools', description: 'Tool discovery and execution' },
        { name: 'policies', description: 'Execution policy management' },
        { name: 'executions', description: 'Execution history and audit' },
        { name: 'triggers', description: 'Webhook trigger management' },
        { name: 'admin', description: 'Organization and environment management' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
  });

  // ─── Auth middleware ──────────────────────────────────────────────────────────
  // Registered before routes so req.apiKey / req.session decorators are available
  const redis = new Redis(config.VALKEY_URL, {
    lazyConnect: true,
    // Reject commands immediately when the connection is unavailable (test/offline mode).
    // Without this, commands queue indefinitely while ioredis retries the connection.
    maxRetriesPerRequest: 0,
  });
  await app.register(authMiddleware, {
    db,
    redis,
    jwtSecret: config.JWT_SECRET,
    apiKeyPrefix: config.API_KEY_PREFIX,
  });

  // ─── Global auth pre-handler ──────────────────────────────────────────────────
  // Populates req.apiKey or req.session when credentials are present.
  // Routes still perform their own inline 401 check as defense-in-depth.
  // Public paths (health, docs) are skipped so they remain unauthenticated.
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    const rawUrl = req.raw.url ?? '';
    const path = rawUrl.split('?')[0] ?? '';
    if (path === '/health' || path === '/metrics' || path === '/ready' || path.startsWith('/docs')) return;
    const hasApiKey = !!req.headers['x-api-key'];
    const hasBearer = (req.headers['authorization'] ?? '').startsWith('Bearer ');
    if (!hasApiKey && !hasBearer) return; // inline route check will 401
    // Catch auth errors here so they use our error format.
    // Fastify does not route preHandler hook errors through the root setErrorHandler.
    try {
      await (app as unknown as ArcaneApp).requireAuth()(req, reply);
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 401;
      const code = (err as { code?: string }).code ?? 'UNAUTHORIZED';
      const message = err instanceof Error ? err.message : 'Authentication failed';
      return reply.status(statusCode).send({
        error: { code, message, request_id: req.id },
      });
    }

    // ── Per-key rate limiting (post-auth) ──────────────────────────────────────
    // Applied after auth so we can key on the resolved API key ID.
    // Falls through silently if Valkey is unavailable (SI-14: never authoritative).
    if (req.apiKey) {
      const keyId = req.apiKey.id;
      const windowKey = `rate:key:${keyId}:${Math.floor(Date.now() / 60_000)}`;
      try {
        const count = await redis.incr(windowKey);
        if (count === 1) await redis.expire(windowKey, 90); // 90s covers window + skew
        if (count > config.RATE_LIMIT_PER_KEY_RPM) {
          rateLimitCounter.add(1, { 'rate_limit.key_type': 'api_key_per_key' });
          return reply.status(429).send({
            error: {
              code: 'RATE_LIMITED',
              message: 'Per-key rate limit exceeded. Retry after 1 minute.',
              request_id: req.id,
            },
          });
        }
      } catch {
        // SI-14: Valkey unavailable → fail open; rate limit is defense-in-depth
      }
    }
  });

  // ─── Request metrics ──────────────────────────────────────────────────────────
  // Track every request: method, route pattern, status code, duration.
  // onRequest fires as early as possible to capture total latency.
  app.addHook('onRequest', async (req) => {
    (req as FastifyRequest & { _reqStart?: number })._reqStart = Date.now();
  });

  app.addHook('onResponse', async (req, reply) => {
    const start = (req as FastifyRequest & { _reqStart?: number })._reqStart;
    const durationMs = start !== undefined ? Date.now() - start : 0;
    const routeUrl = (req.routeOptions?.url as string | undefined) ?? req.url.split('?')[0] ?? 'unknown';
    const attrs = {
      'http.method': req.method,
      'http.route': routeUrl,
      'http.status_code': String(reply.statusCode),
    };
    apiRequestCounter.add(1, attrs);
    apiRequestDuration.record(durationMs, attrs);
  });

  // ─── /metrics — Prometheus scrape endpoint ────────────────────────────────────
  // Public (no auth) — Prometheus scrapes from within the infra network only.
  // The endpoint is intentionally excluded from the global preHandler auth check
  // (same as /health) so it never blocks on missing credentials.
  app.get('/metrics', async (_req, reply) => {
    const body = await collectPrometheusMetrics();
    if (body === null) {
      // OTel not initialized (test environments) — return empty registry
      return reply
        .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
        .send('# OTel not initialized\n');
    }
    return reply
      .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(body);
  });

  // ─── Global error handler ─────────────────────────────────────────────────────
  // Must be registered BEFORE route plugins so child scopes inherit this handler.
  // Fastify captures the error handler reference at plugin-registration time;
  // registering after the plugins means they use the default handler instead.
  app.setErrorHandler((error, req, reply) => {
    req.log.error({ err: error }, 'Unhandled route error');

    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    const code = (error as { code?: string }).code ?? 'INTERNAL_ERROR';

    return reply.status(statusCode).send({
      error: {
        code,
        message: statusCode === 500 ? 'Internal server error' : error.message,
        request_id: req.id,
      },
    });
  });

  // ─── Routes ───────────────────────────────────────────────────────────────────
  await app.register(import('./routes/health.js'));
  await app.register(import('./routes/sessions.js'), { config });
  await app.register(import('./routes/connections.js'), { config });
  await app.register(import('./routes/tools.js'), { config });
  await app.register(import('./routes/executions.js'), { config, ...(js ? { js } : {}) });
  await app.register(import('./routes/search.js'), { config });

  await app.register(import('./routes/triggers.js'), { config });

  // TODO Phase 2+:
  // await app.register(import('./routes/policies.js'));
  // await app.register(import('./routes/admin.js'));

  return app;
}
