/**
 * Tool search route — POST /v1/search/tools
 *
 * Hybrid FTS + pg_trgm search. Accepts a natural-language query and
 * optional filters; returns ranked tool results with connection status.
 *
 * SI-05: Tool description is untrusted data — returned as-is, never
 *        eval'd or used for routing decisions.
 * SI-13: All query params are parameterized inside @arcane/search.
 */

import type { FastifyInstance } from 'fastify';
import { searchTools } from '@arcane/search';
import { ToolSearchRequestSchema } from '@arcane/schemas';
import type { ApiConfig } from '@arcane/config';

interface SearchRouteContext {
  config: ApiConfig;
}

export default async function searchRoutes(
  fastify: FastifyInstance,
  _opts: SearchRouteContext,
): Promise<void> {
  /**
   * POST /v1/search/tools
   *
   * Body: ToolSearchRequest
   * Response: { data: ToolSearchResult[], next_cursor: string | null, total_returned: number }
   */
  fastify.post(
    '/v1/search/tools',
    {
      schema: {
        tags: ['search'],
        summary: 'Search for tools by name, description, or category',
        description:
          'Hybrid full-text + trigram search over available tools. ' +
          'Results are ranked by relevance. Supports cursor pagination.',
        body: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1, maxLength: 500, description: 'Search query' },
            toolkit: { type: 'string', description: 'Filter to a specific toolkit slug' },
            category: { type: 'string', description: 'Filter by category' },
            risk_level: { type: 'string', description: 'Filter by risk level (e.g. READ_ONLY)' },
            connected_only: {
              type: 'boolean',
              default: false,
              description: 'Only return tools with an active connection',
            },
            session_id: { type: 'string', description: 'Session ID for connection status' },
            limit: { type: 'number', default: 20, minimum: 1, maximum: 100 },
            cursor: { type: 'string', description: 'Pagination cursor (tool_id)' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              data: { type: 'array' },
              next_cursor: { type: ['string', 'null'] },
              total_returned: { type: 'number' },
            },
          },
          400: {
            type: 'object',
            properties: {
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'array' },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey && !req.session) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
      }

      // Validate + parse the request body
      const parsed = ToolSearchRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid search parameters',
            details: parsed.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }

      const {
        q,
        toolkit,
        category,
        risk_level,
        connected_only,
        session_id,
        limit = 20,
        cursor,
      } = parsed.data;

      // Derive environment_id from auth context (set by middleware)
      const environment_id = req.environmentId ?? undefined;

      const rows = await searchTools({
        q,
        ...(toolkit !== undefined ? { toolkit } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(risk_level !== undefined ? { risk_level } : {}),
        connected_only,
        ...(session_id !== undefined ? { session_id } : {}),
        ...(environment_id !== undefined ? { environment_id } : {}),
        limit,
        ...(cursor !== undefined ? { cursor } : {}),
      });

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit);

      return reply.send({
        data,
        next_cursor: hasMore ? (data[data.length - 1]?.tool_id ?? null) : null,
        total_returned: data.length,
      });
    },
  );

  /**
   * GET /v1/search/tools?q=...
   *
   * Convenience GET variant — useful for quick browser/curl queries.
   * All filters are query params. Body variant is preferred for complex filters.
   */
  fastify.get(
    '/v1/search/tools',
    {
      schema: {
        tags: ['search'],
        summary: 'Search for tools (GET convenience variant)',
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1, maxLength: 500 },
            toolkit: { type: 'string' },
            category: { type: 'string' },
            risk_level: { type: 'string' },
            connected_only: { type: 'boolean', default: false },
            session_id: { type: 'string' },
            limit: { type: 'number', default: 20, minimum: 1, maximum: 100 },
            cursor: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey && !req.session) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
      }

      const qs = req.query as {
        q: string;
        toolkit?: string;
        category?: string;
        risk_level?: string;
        connected_only?: boolean;
        session_id?: string;
        limit?: number;
        cursor?: string;
      };

      const parsed = ToolSearchRequestSchema.safeParse(qs);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid search parameters',
            details: parsed.error.issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }

      const { q, toolkit, category, risk_level, connected_only, session_id, limit = 20, cursor } =
        parsed.data;

      const environment_id = req.environmentId ?? undefined;

      const rows = await searchTools({
        q,
        ...(toolkit !== undefined ? { toolkit } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(risk_level !== undefined ? { risk_level } : {}),
        connected_only,
        ...(session_id !== undefined ? { session_id } : {}),
        ...(environment_id !== undefined ? { environment_id } : {}),
        limit,
        ...(cursor !== undefined ? { cursor } : {}),
      });

      const hasMore = rows.length > limit;
      const data = rows.slice(0, limit);

      return reply.send({
        data,
        next_cursor: hasMore ? (data[data.length - 1]?.tool_id ?? null) : null,
        total_returned: data.length,
      });
    },
  );
}
