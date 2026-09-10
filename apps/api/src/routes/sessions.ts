/**
 * Session routes — create and revoke runtime sessions.
 *
 * Sessions are short-lived (max 24h) bearer tokens that end-users
 * of the integrating application use to call tools via SDK/MCP.
 *
 * Auth: X-Api-Key with WRITE or EXECUTE permission.
 * SI-17: Sessions max 24h. Expired sessions rejected at middleware.
 */

import type { FastifyInstance } from 'fastify';
import { generateId, getPool } from '@arcane/core';
import { UnauthorizedError, NotFoundError } from '@arcane/core';
import { issueSessionToken } from '@arcane/auth';
import { CreateSessionSchema } from '@arcane/schemas';
import type { ApiConfig } from '@arcane/config';

interface SessionRouteContext {
  config: ApiConfig;
}

export default async function sessionRoutes(
  fastify: FastifyInstance,
  { config }: SessionRouteContext,
): Promise<void> {
  // ─── POST /sessions — create a new session ───────────────────────────────────

  fastify.post(
    '/sessions',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Create a session for an external user',
        body: {
          type: 'object',
          required: ['external_user_id'],
          properties: {
            external_user_id: { type: 'string', minLength: 1, maxLength: 255 },
            expires_in_seconds: { type: 'number', minimum: 1, maximum: 86400, default: 3600 },
            metadata: { type: 'object' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey) throw new UnauthorizedError();

      // Parse and validate body with Zod
      const parsed = CreateSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues.map((i) => i.message).join('; '),
          },
        });
      }

      const { external_user_id, expires_in_seconds, metadata } = parsed.data;
      const db = getPool();
      const environmentId = req.apiKey.environment_id;

      // Upsert external user — idempotent, creates if not exists
      await db.query(
        `INSERT INTO external_users (id, environment_id, external_user_id, metadata)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (environment_id, external_user_id) DO NOTHING`,
        [generateId(), environmentId, external_user_id, JSON.stringify(metadata ?? {})],
      );

      // Resolve external_user row id
      const { rows: userRows } = await db.query<{ id: string }>(
        `SELECT id FROM external_users WHERE environment_id = $1 AND external_user_id = $2`,
        [environmentId, external_user_id],
      );

      const externalUserId = userRows[0]?.id;
      if (!externalUserId) {
        throw new NotFoundError('ExternalUser', external_user_id);
      }

      // Create session
      const sessionId = generateId();
      const expiresAt = new Date(Date.now() + (expires_in_seconds ?? 3600) * 1000);

      await db.query(
        `INSERT INTO sessions (id, environment_id, external_user_id, status, expires_at, metadata)
         VALUES ($1, $2, $3, 'ACTIVE', $4, $5)`,
        [sessionId, environmentId, externalUserId, expiresAt.toISOString(), JSON.stringify(metadata ?? {})],
      );

      // Issue JWT
      const token = issueSessionToken({
        sessionId,
        environmentId,
        secret: config.JWT_SECRET,
        expiresIn: expires_in_seconds ?? 3600,
      });

      return reply.status(201).send({
        session_id: sessionId,
        token,
        expires_at: expiresAt.toISOString(),
        external_user_id,
      });
    },
  );

  // ─── DELETE /sessions/:id — revoke a session ─────────────────────────────────

  fastify.delete(
    '/sessions/:id',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Revoke a session',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey) throw new UnauthorizedError();

      const { id } = req.params as { id: string };
      const db = getPool();

      const { rowCount } = await db.query(
        `UPDATE sessions
         SET status = 'REVOKED', updated_at = NOW()
         WHERE id = $1 AND environment_id = $2 AND status = 'ACTIVE'`,
        [id, req.apiKey.environment_id],
      );

      if (!rowCount) {
        throw new NotFoundError('Session', id);
      }

      return reply.status(204).send();
    },
  );

  // ─── GET /sessions/:id — get session details ──────────────────────────────────

  fastify.get(
    '/sessions/:id',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Get session details',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey) throw new UnauthorizedError();

      const { id } = req.params as { id: string };
      const db = getPool();

      const { rows } = await db.query<{
        id: string;
        external_user_id: string;
        status: string;
        expires_at: Date;
        metadata: Record<string, unknown>;
        created_at: Date;
      }>(
        `SELECT s.id, eu.external_user_id, s.status, s.expires_at, s.metadata, s.created_at
         FROM sessions s
         JOIN external_users eu ON eu.id = s.external_user_id
         WHERE s.id = $1 AND s.environment_id = $2`,
        [id, req.apiKey.environment_id],
      );

      const row = rows[0];
      if (!row) throw new NotFoundError('Session', id);

      return reply.send({
        id: row.id,
        external_user_id: row.external_user_id,
        status: row.status,
        expires_at: row.expires_at.toISOString(),
        metadata: row.metadata,
        created_at: row.created_at.toISOString(),
      });
    },
  );
}
