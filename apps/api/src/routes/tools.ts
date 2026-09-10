/**
 * Tool discovery routes — toolkit search, tool lookup, tool execution.
 *
 * SI-05: Tool metadata (name, description) is untrusted data — rendered
 *        in UI, passed to LLMs as data. NEVER eval'd or interpreted.
 * SI-06: Published tool versions are immutable.
 * SI-04: Every execution is policy-checked BEFORE credential resolution.
 */

import type { FastifyInstance } from 'fastify';
import { getPool } from '@arcane/core';
import { NotFoundError } from '@arcane/core';
import type { ApiConfig } from '@arcane/config';

interface ToolRouteContext {
  config: ApiConfig;
}

export default async function toolRoutes(
  fastify: FastifyInstance,
  _opts: ToolRouteContext,
): Promise<void> {
  // ─── GET /toolkits — list available toolkits ──────────────────────────────────

  fastify.get(
    '/toolkits',
    {
      schema: {
        tags: ['tools'],
        summary: 'List available toolkits',
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            q: { type: 'string', description: 'Full-text search query' },
            limit: { type: 'number', default: 20, maximum: 100 },
            cursor: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey && !req.session) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
      }

      const { category, q, limit = 20, cursor } = req.query as {
        category?: string;
        q?: string;
        limit?: number;
        cursor?: string;
      };

      const db = getPool();
      const params: unknown[] = [Math.min(limit + 1, 101)]; // fetch +1 for hasMore
      let idx = 2;
      const conditions: string[] = ["status = 'ACTIVE'"];

      if (cursor) {
        conditions.push(`id > $${idx++}`);
        params.push(cursor);
      }
      if (category) {
        conditions.push(`category = $${idx++}`);
        params.push(category.toUpperCase());
      }
      if (q) {
        conditions.push(`(to_tsvector('english', name || ' ' || description) @@ plainto_tsquery('english', $${idx++}) OR name ILIKE $${idx++})`);
        params.push(q, `%${q}%`);
      }

      const { rows } = await db.query<{
        id: string;
        slug: string;
        name: string;
        description: string;
        category: string;
        status: string;
        created_at: Date;
      }>(
        `SELECT id, slug, name, description, category, status, created_at
         FROM toolkits
         WHERE ${conditions.join(' AND ')}
         ORDER BY id ASC
         LIMIT $1`,
        params,
      );

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit);

      return reply.send({
        data,
        next_cursor: hasMore ? data[data.length - 1]?.id : null,
      });
    },
  );

  // ─── GET /toolkits/:slug/tools — list tools in a toolkit ─────────────────────

  fastify.get(
    '/toolkits/:slug/tools',
    {
      schema: {
        tags: ['tools'],
        summary: 'List tools in a toolkit',
        params: {
          type: 'object',
          required: ['slug'],
          properties: { slug: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey && !req.session) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
      }

      const { slug } = req.params as { slug: string };
      const db = getPool();

      // Toolkit existence check
      const { rows: tkRows } = await db.query<{ id: string }>(
        `SELECT id FROM toolkits WHERE slug = $1 AND status = 'ACTIVE'`,
        [slug],
      );
      if (!tkRows[0]) throw new NotFoundError('Toolkit', slug);

      // Return published tools with latest published version info
      // SI-05: description is untrusted data — returned as-is, never interpreted
      const { rows } = await db.query<{
        id: string;
        slug: string;
        name: string;
        description: string;
        status: string;
        latest_version: number | null;
        risk_level: string[] | null;
        read_only: boolean | null;
      }>(
        `SELECT t.id, t.slug, t.name, t.description, t.status,
                tv.version AS latest_version, tv.risk_level, tv.read_only
         FROM tools t
         LEFT JOIN tool_versions tv ON tv.tool_id = t.id
           AND tv.status = 'PUBLISHED'
           AND tv.version = (
             SELECT MAX(tv2.version) FROM tool_versions tv2
             WHERE tv2.tool_id = t.id AND tv2.status = 'PUBLISHED'
           )
         WHERE t.toolkit_id = $1 AND t.status = 'ACTIVE'
         ORDER BY t.slug ASC`,
        [tkRows[0].id],
      );

      return reply.send({ data: rows });
    },
  );

  // ─── GET /toolkits/:slug/tools/:toolSlug — get a specific tool ───────────────

  fastify.get(
    '/toolkits/:slug/tools/:toolSlug',
    {
      schema: {
        tags: ['tools'],
        summary: 'Get a tool with its latest published version schema',
        params: {
          type: 'object',
          required: ['slug', 'toolSlug'],
          properties: {
            slug: { type: 'string' },
            toolSlug: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey && !req.session) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
      }

      const { slug, toolSlug } = req.params as { slug: string; toolSlug: string };
      const db = getPool();

      const { rows } = await db.query<{
        id: string;
        slug: string;
        name: string;
        description: string;
        version: number;
        version_id: string;
        input_schema: Record<string, unknown>;
        output_schema: Record<string, unknown>;
        risk_level: string[];
        read_only: boolean;
        destructive: boolean;
        idempotent: boolean;
      }>(
        `SELECT t.id, t.slug, t.name, t.description,
                tv.version, tv.id AS version_id,
                tv.input_schema, tv.output_schema,
                tv.risk_level, tv.read_only, tv.destructive, tv.idempotent
         FROM tools t
         JOIN tool_versions tv ON tv.tool_id = t.id AND tv.status = 'PUBLISHED'
         JOIN toolkits tk ON tk.id = t.toolkit_id AND tk.slug = $1
         WHERE t.slug = $2 AND t.status = 'ACTIVE'
         ORDER BY tv.version DESC
         LIMIT 1`,
        [slug, toolSlug],
      );

      const row = rows[0];
      if (!row) throw new NotFoundError('Tool', `${slug}/${toolSlug}`);

      return reply.send({
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description, // SI-05: untrusted, returned as data
        latest_version: {
          id: row.version_id,
          version: row.version,
          input_schema: row.input_schema,
          output_schema: row.output_schema,
          risk_level: row.risk_level,
          read_only: row.read_only,
          destructive: row.destructive,
          idempotent: row.idempotent,
        },
      });
    },
  );
}
