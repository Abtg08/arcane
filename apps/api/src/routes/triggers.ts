/**
 * Trigger management routes.
 *
 * Triggers define which provider events an environment cares about.
 * Subscriptions map triggers to external users.
 * Webhook destinations are the URLs deliveries are sent to.
 *
 * POST   /triggers                        — create trigger
 * GET    /triggers                        — list triggers (cursor-paginated)
 * GET    /triggers/:id                    — get trigger
 * PATCH  /triggers/:id                    — update status/config
 * DELETE /triggers/:id                    — soft-delete (DELETED status)
 *
 * POST   /triggers/:id/subscriptions      — subscribe external user
 * GET    /triggers/:id/subscriptions      — list subscriptions
 * DELETE /triggers/:id/subscriptions/:sid — unsubscribe
 *
 * POST   /webhook-destinations            — register delivery endpoint
 * GET    /webhook-destinations            — list endpoints
 * DELETE /webhook-destinations/:id        — remove endpoint
 */

import type { FastifyInstance } from 'fastify';
import { getPool, generateId } from '@arcane/core';
import { NotFoundError } from '@arcane/core';
import type { ApiConfig } from '@arcane/config';

interface TriggerRouteContext {
  config: ApiConfig;
}

export default async function triggerRoutes(
  fastify: FastifyInstance,
  _opts: TriggerRouteContext,
): Promise<void> {
  // ── POST /triggers ────────────────────────────────────────────────────────────

  fastify.post(
    '/triggers',
    {
      schema: {
        body: {
          type: 'object',
          required: ['toolkit_id', 'name', 'event_type'],
          properties: {
            toolkit_id: { type: 'string', format: 'uuid' },
            name: { type: 'string', minLength: 1, maxLength: 255 },
            event_type: { type: 'string', minLength: 1 },
            configuration: { type: 'object' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey && !req.session) return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });

      const body = req.body as {
        toolkit_id: string;
        name: string;
        event_type: string;
        configuration?: Record<string, unknown>;
      };

      const db = getPool();
      const id = generateId();

      const { rows } = await db.query<{ id: string; created_at: Date }>(
        `INSERT INTO triggers
           (id, environment_id, toolkit_id, name, event_type, status, configuration, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, NOW(), NOW())
         RETURNING id, created_at`,
        [
          id,
          req.environmentId,
          body.toolkit_id,
          body.name,
          body.event_type,
          JSON.stringify(body.configuration ?? {}),
        ],
      );

      const row = rows[0];
      return reply.status(201).send({ id: row?.id ?? id, status: 'ACTIVE', created_at: row?.created_at });
    },
  );

  // ── GET /triggers ─────────────────────────────────────────────────────────────

  fastify.get(
    '/triggers',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            limit: { type: 'number', default: 20, maximum: 100 },
            cursor: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey && !req.session) return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });

      const { status, limit = 20, cursor } = req.query as {
        status?: string;
        limit?: number;
        cursor?: string;
      };

      const db = getPool();
      const params: unknown[] = [req.environmentId, Math.min(limit + 1, 101)];
      const conditions = ['environment_id = $1', "status != 'DELETED'"];
      let idx = 3;

      if (cursor) { conditions.push(`id < $${idx++}`); params.push(cursor); }
      if (status) { conditions.push(`status = $${idx++}`); params.push(status.toUpperCase()); }

      const { rows } = await db.query<{
        id: string; name: string; event_type: string; status: string;
        toolkit_id: string; created_at: Date; updated_at: Date;
      }>(
        `SELECT id, name, event_type, status, toolkit_id, created_at, updated_at
         FROM triggers
         WHERE ${conditions.join(' AND ')}
         ORDER BY id DESC LIMIT $2`,
        params,
      );

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit);
      return reply.send({ data, next_cursor: hasMore ? data[data.length - 1]?.id ?? null : null });
    },
  );

  // ── GET /triggers/:id ─────────────────────────────────────────────────────────

  fastify.get(
    '/triggers/:id',
    async (req, reply) => {
      if (!req.apiKey && !req.session) return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });

      const { id } = req.params as { id: string };
      const db = getPool();

      const { rows } = await db.query<{
        id: string; name: string; event_type: string; status: string;
        toolkit_id: string; configuration: Record<string, unknown>;
        created_at: Date; updated_at: Date;
      }>(
        `SELECT id, name, event_type, status, toolkit_id, configuration, created_at, updated_at
         FROM triggers WHERE id = $1 AND environment_id = $2`,
        [id, req.environmentId],
      );

      const row = rows[0];
      if (!row) throw new NotFoundError('Trigger', id);

      // Never expose signing secrets (SI-03 analogue for triggers)
      const safeConfig = { ...(row.configuration ?? {}) };
      delete safeConfig['signing_secret'];
      delete safeConfig['secret_reference'];

      return reply.send({ ...row, configuration: safeConfig });
    },
  );

  // ── PATCH /triggers/:id ───────────────────────────────────────────────────────

  fastify.patch(
    '/triggers/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            status: { type: 'string', enum: ['ACTIVE', 'PAUSED'] },
            configuration: { type: 'object' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey && !req.session) return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });

      const { id } = req.params as { id: string };
      const body = req.body as {
        name?: string;
        status?: string;
        configuration?: Record<string, unknown>;
      };
      const db = getPool();

      const sets: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [id, req.environmentId];
      let idx = 3;

      if (body.name !== undefined) { sets.push(`name = $${idx++}`); params.push(body.name); }
      if (body.status !== undefined) { sets.push(`status = $${idx++}`); params.push(body.status.toUpperCase()); }
      if (body.configuration !== undefined) { sets.push(`configuration = $${idx++}`); params.push(JSON.stringify(body.configuration)); }

      if (sets.length === 1) return reply.status(400).send({ error: { code: 'NO_FIELDS' } });

      const { rowCount } = await db.query(
        `UPDATE triggers SET ${sets.join(', ')} WHERE id = $1 AND environment_id = $2 AND status != 'DELETED'`,
        params,
      );

      if (!rowCount) throw new NotFoundError('Trigger', id);
      return reply.send({ updated: true });
    },
  );

  // ── DELETE /triggers/:id ──────────────────────────────────────────────────────

  fastify.delete('/triggers/:id', async (req, reply) => {
    if (!req.apiKey && !req.session) return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });

    const { id } = req.params as { id: string };
    const db = getPool();

    const { rowCount } = await db.query(
      `UPDATE triggers SET status = 'DELETED', updated_at = NOW()
       WHERE id = $1 AND environment_id = $2 AND status != 'DELETED'`,
      [id, req.environmentId],
    );

    if (!rowCount) throw new NotFoundError('Trigger', id);
    return reply.status(204).send();
  });

  // ── POST /triggers/:id/subscriptions ─────────────────────────────────────────

  fastify.post(
    '/triggers/:id/subscriptions',
    {
      schema: {
        body: {
          type: 'object',
          required: ['external_user_id', 'destination_id'],
          properties: {
            external_user_id: { type: 'string' },
            destination_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey && !req.session) return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });

      const { id: triggerId } = req.params as { id: string };
      const body = req.body as { external_user_id: string; destination_id: string };
      const db = getPool();

      // Verify trigger belongs to this environment
      const { rows: tRows } = await db.query<{ id: string }>(
        `SELECT id FROM triggers WHERE id = $1 AND environment_id = $2 AND status = 'ACTIVE'`,
        [triggerId, req.environmentId],
      );
      if (!tRows[0]) throw new NotFoundError('Trigger', triggerId);

      // Resolve external_user_id → UUID
      const { rows: euRows } = await db.query<{ id: string }>(
        `SELECT id FROM external_users WHERE external_user_id = $1 AND environment_id = $2`,
        [body.external_user_id, req.environmentId],
      );
      if (!euRows[0]) throw new NotFoundError('ExternalUser', body.external_user_id);

      const subId = generateId();
      await db.query(
        `INSERT INTO trigger_subscriptions
           (id, trigger_id, external_user_id, destination_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())
         ON CONFLICT (trigger_id, external_user_id) DO UPDATE SET
           destination_id = EXCLUDED.destination_id, status = 'ACTIVE', updated_at = NOW()`,
        [subId, triggerId, euRows[0].id, body.destination_id],
      );

      return reply.status(201).send({ id: subId, trigger_id: triggerId, status: 'ACTIVE' });
    },
  );

  // ── GET /triggers/:id/subscriptions ──────────────────────────────────────────

  fastify.get('/triggers/:id/subscriptions', async (req, reply) => {
    if (!req.apiKey && !req.session) return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });

    const { id: triggerId } = req.params as { id: string };
    const db = getPool();

    const { rows } = await db.query<{
      id: string; trigger_id: string; external_user_id: string;
      destination_id: string; status: string; created_at: Date;
    }>(
      `SELECT ts.id, ts.trigger_id, eu.external_user_id, ts.destination_id, ts.status, ts.created_at
       FROM trigger_subscriptions ts
       JOIN external_users eu ON eu.id = ts.external_user_id
       WHERE ts.trigger_id = $1 AND ts.status = 'ACTIVE'`,
      [triggerId],
    );

    return reply.send({ data: rows });
  });

  // ── DELETE /triggers/:id/subscriptions/:sid ───────────────────────────────────

  fastify.delete('/triggers/:id/subscriptions/:sid', async (req, reply) => {
    if (!req.apiKey && !req.session) return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });

    const { sid } = req.params as { id: string; sid: string };
    const db = getPool();

    const { rowCount } = await db.query(
      `UPDATE trigger_subscriptions SET status = 'DELETED', updated_at = NOW()
       WHERE id = $1 AND status != 'DELETED'`,
      [sid],
    );
    if (!rowCount) throw new NotFoundError('Subscription', sid);
    return reply.status(204).send();
  });

  // ── POST /webhook-destinations ────────────────────────────────────────────────

  fastify.post(
    '/webhook-destinations',
    {
      schema: {
        body: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', format: 'uri' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey && !req.session) return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });

      const body = req.body as { url: string };
      const db = getPool();
      const id = generateId();

      await db.query(
        `INSERT INTO webhook_destinations
           (id, environment_id, url, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'ACTIVE', NOW(), NOW())`,
        [id, req.environmentId, body.url],
      );

      return reply.status(201).send({ id, url: body.url, status: 'ACTIVE' });
    },
  );

  // ── GET /webhook-destinations ─────────────────────────────────────────────────

  fastify.get('/webhook-destinations', async (req, reply) => {
    if (!req.apiKey && !req.session) return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });

    const db = getPool();
    const { rows } = await db.query<{
      id: string; url: string; status: string; created_at: Date;
    }>(
      `SELECT id, url, status, created_at FROM webhook_destinations
       WHERE environment_id = $1 AND status != 'DELETED' ORDER BY created_at DESC`,
      [req.environmentId],
    );

    return reply.send({ data: rows });
  });

  // ── DELETE /webhook-destinations/:id ─────────────────────────────────────────

  fastify.delete('/webhook-destinations/:id', async (req, reply) => {
    if (!req.apiKey && !req.session) return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });

    const { id } = req.params as { id: string };
    const db = getPool();

    const { rowCount } = await db.query(
      `UPDATE webhook_destinations SET status = 'DELETED', updated_at = NOW()
       WHERE id = $1 AND environment_id = $2 AND status != 'DELETED'`,
      [id, req.environmentId],
    );
    if (!rowCount) throw new NotFoundError('WebhookDestination', id);
    return reply.status(204).send();
  });
}
