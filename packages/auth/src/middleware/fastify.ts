/**
 * Fastify authentication middleware plugin.
 *
 * Decorates requests with the resolved identity:
 *   - req.apiKey  — set when authenticated via X-Api-Key header
 *   - req.session — set when authenticated via Bearer JWT
 *
 * Route handlers declare which they need via preHandler hooks.
 * Unauthenticated routes skip decoration entirely.
 *
 * SI-03: secret_reference and key_hash are NEVER added to req context.
 * SI-17: Expired sessions rejected here, before route handlers run.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { UnauthorizedError } from '@arcane/core';
import type { DbPool } from '@arcane/core';
import type { Redis } from 'ioredis';
import type { UUIDv7 } from '@arcane/schemas';
import type { ApiKeyPermission, Session } from '@arcane/schemas';
import { validateApiKey, hasPermission, type ValidatedApiKey } from '../apikey/validate.js';
import { verifySessionToken } from '../jwt/index.js';
import { validateSession } from '../session/validate.js';

export interface AuthPluginOptions {
  db: DbPool;
  redis: Redis;
  jwtSecret: string;
  apiKeyPrefix: string;
}

// Augment FastifyRequest with auth context
declare module 'fastify' {
  interface FastifyRequest {
    apiKey?: ValidatedApiKey;
    session?: Session;
    /** Resolved environment_id — set by either auth path */
    environmentId?: UUIDv7;
  }
}

/**
 * Fastify plugin that registers auth decorators and preHandler factories.
 */
async function authPlugin(
  fastify: FastifyInstance,
  opts: AuthPluginOptions,
): Promise<void> {
  const { db, redis, jwtSecret, apiKeyPrefix } = opts;

  // ─── API Key auth preHandler ──────────────────────────────────────────────────

  /**
   * Authenticate via X-Api-Key header.
   * Usage: { preHandler: [fastify.requireApiKey('EXECUTE')] }
   */
  fastify.decorate(
    'requireApiKey',
    function (requiredPermission?: ApiKeyPermission) {
      return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const rawKey = req.headers['x-api-key'] as string | undefined;

        if (!rawKey) {
          throw new UnauthorizedError('Missing X-Api-Key header');
        }

        if (!rawKey.startsWith(apiKeyPrefix)) {
          throw new UnauthorizedError('Invalid API key format');
        }

        const key = await validateApiKey(rawKey, db);
        req.apiKey = key;
        req.environmentId = key.environment_id;

        if (requiredPermission && !hasPermission(key, requiredPermission)) {
          reply.status(403);
          throw new Error(
            `API key lacks required permission: ${requiredPermission}`,
          );
        }
      };
    },
  );

  // ─── Session (JWT) auth preHandler ───────────────────────────────────────────

  /**
   * Authenticate via Bearer JWT in Authorization header.
   * Validates JWT signature, then checks session in DB (with Valkey cache).
   * Usage: { preHandler: [fastify.requireSession()] }
   */
  fastify.decorate('requireSession', function () {
    return async (req: FastifyRequest): Promise<void> => {
      const authHeader = req.headers['authorization'];

      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or malformed Authorization header');
      }

      const token = authHeader.slice(7);
      const payload = verifySessionToken(token, jwtSecret);

      // Verify session still exists and is ACTIVE in DB
      const session = await validateSession(payload.sub, db, redis);
      req.session = session;
      req.environmentId = session.environment_id;
    };
  });

  // ─── Combined preHandler (API key OR session) ─────────────────────────────────

  /**
   * Accepts either X-Api-Key or Bearer JWT.
   * Useful for endpoints callable from both server-side (API key) and client SDK (JWT).
   */
  fastify.decorate('requireAuth', function () {
    return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const hasApiKey = !!req.headers['x-api-key'];
      const hasBearer = req.headers['authorization']?.startsWith('Bearer ');

      if (!hasApiKey && !hasBearer) {
        throw new UnauthorizedError('Authentication required');
      }

      if (hasApiKey) {
        await (fastify as ArcaneServer).requireApiKey()(req, reply);
      } else {
        await (fastify as ArcaneServer).requireSession()(req);
      }
    };
  });
}

// Type augmentation for the decorated Fastify instance
interface ArcaneServer extends FastifyInstance {
  requireApiKey: (permission?: ApiKeyPermission) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireSession: () => (req: FastifyRequest) => Promise<void>;
  requireAuth: () => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export const authMiddleware = fp(authPlugin, {
  name: 'arcane-auth',
  fastify: '4.x',
});
