/**
 * Fastify application factory.
 *
 * Separated from server.ts so integration tests can import buildApp()
 * without spawning a listener.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import type pino from 'pino';
import type { ApiConfig } from '@arcane/config';

export async function buildApp(config: ApiConfig, logger: pino.Logger): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger,
    // requestIdLogLabel is trace-id injected by OTel transport
    genReqId: () => crypto.randomUUID(),
    requestIdLogLabel: 'request_id',
  });

  // ─── Security ────────────────────────────────────────────────────────────────
  await app.register(helmet, {
    // CSP is enforced at the edge / dashboard level; API returns JSON only
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
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
    errorResponseBuilder: (_req, context) => ({
      error: {
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Retry after ${String(context.after)}.`,
        request_id: crypto.randomUUID(),
      },
    }),
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

  // ─── Routes ───────────────────────────────────────────────────────────────────
  // Registered here; implementation in routes/ directory
  await app.register(import('./routes/health.js'));

  // TODO Phase 1-C+: register auth middleware + all route handlers
  // await app.register(import('./routes/sessions.js'));
  // await app.register(import('./routes/connections.js'));
  // await app.register(import('./routes/tools.js'));
  // await app.register(import('./routes/executions.js'));
  // await app.register(import('./routes/policies.js'));
  // await app.register(import('./routes/triggers.js'));
  // await app.register(import('./routes/admin.js'));

  // ─── Global error handler ─────────────────────────────────────────────────────
  app.setErrorHandler((error, req, reply) => {
    req.log.error({ err: error }, 'Unhandled route error');

    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    const code = (error as { code?: string }).code ?? 'INTERNAL_ERROR';

    void reply.status(statusCode).send({
      error: {
        code,
        message: statusCode === 500 ? 'Internal server error' : error.message,
        request_id: req.id,
      },
    });
  });

  return app;
}
