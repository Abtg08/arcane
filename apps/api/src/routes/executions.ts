/**
 * Execution gateway — the heart of Arcane.
 *
 * Pipeline (must happen in this exact order — see SECURITY_INVARIANTS.md):
 *
 *   1. Authenticate (API key or session JWT) ← middleware
 *   2. Resolve tool version (must be PUBLISHED — SI-06)
 *   3. Resolve connection (must be ACTIVE)
 *   4. POLICY CHECK (SI-04 — BEFORE credential resolution)
 *      → DENY: reject immediately, credentials never loaded
 *      → REQUIRE_CONFIRMATION: return 202, pause execution
 *      → ALLOW: continue
 *   5. Write AUTHORIZING audit event (SI-11)
 *   6. Publish NATS job → connector-runtime resolves credentials + executes
 *   7. Await result / stream response
 *   8. Write terminal audit event (SI-11)
 *
 * SI-01: Tool invocation payload sent to LLM never contains credentials.
 * SI-04: Policy check happens BEFORE credential resolution.
 * SI-07: Provider responses validated before being returned.
 * SI-11: All executions logged before and after.
 */

import type { FastifyInstance } from 'fastify';
import { getPool, generateId } from '@arcane/core';
import { NotFoundError, ForbiddenError, PolicyDeniedError, PolicyRequiresConfirmationError } from '@arcane/core';
import { evaluatePolicy } from '@arcane/policy';
import type { ApiConfig } from '@arcane/config';
import type { UUIDv7 } from '@arcane/schemas';

interface ExecutionRouteContext {
  config: ApiConfig;
}

// Execution state machine values
type ExecutionStatus =
  | 'CREATED'
  | 'AUTHORIZING'
  | 'RESOLVING'
  | 'EXECUTING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT';

export default async function executionRoutes(
  fastify: FastifyInstance,
  _opts: ExecutionRouteContext,
): Promise<void> {
  // ─── POST /execute — run a tool ────────────────────────────────────────────────

  fastify.post(
    '/execute',
    {
      schema: {
        tags: ['tools'],
        summary: 'Execute a tool on behalf of an external user',
        body: {
          type: 'object',
          required: ['tool_slug', 'toolkit_slug', 'connection_id', 'input'],
          properties: {
            tool_slug: { type: 'string' },
            toolkit_slug: { type: 'string' },
            connection_id: { type: 'string', format: 'uuid' },
            tool_version: { type: 'number', description: 'Specific version — omit for latest published' },
            input: { type: 'object', description: 'Tool input parameters' },
            session_id: { type: 'string', format: 'uuid', description: 'Session context (for policy)' },
          },
        },
      },
    },
    async (req, reply) => {
      // Authentication enforced by middleware (requireAuth)
      if (!req.apiKey && !req.session) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
      }

      const body = req.body as {
        tool_slug: string;
        toolkit_slug: string;
        connection_id: string;
        tool_version?: number;
        input: Record<string, unknown>;
        session_id?: string;
      };

      const db = getPool();
      const environmentId = req.environmentId!;
      const executionId = generateId();

      // ── Step 1: Resolve tool version (must be PUBLISHED — SI-06) ────────────────
      // Note: using parameterized queries for all user input (SI-13)
      const { rows: tvRows } = body.tool_version
        ? await db.query<{
            tool_version_id: string;
            tool_id: string;
            version: number;
            input_schema: Record<string, unknown>;
            risk_level: string[];
          }>(
            `SELECT tv.id AS tool_version_id, tv.tool_id, tv.version, tv.input_schema, tv.risk_level
             FROM tool_versions tv
             JOIN tools t ON t.id = tv.tool_id AND t.slug = $1
             JOIN toolkits tk ON tk.id = t.toolkit_id AND tk.slug = $2
             WHERE tv.status = 'PUBLISHED' AND tv.version = $3`,
            [body.tool_slug, body.toolkit_slug, body.tool_version],
          )
        : await db.query<{
            tool_version_id: string;
            tool_id: string;
            version: number;
            input_schema: Record<string, unknown>;
            risk_level: string[];
          }>(
            `SELECT tv.id AS tool_version_id, tv.tool_id, tv.version, tv.input_schema, tv.risk_level
             FROM tool_versions tv
             JOIN tools t ON t.id = tv.tool_id AND t.slug = $1
             JOIN toolkits tk ON tk.id = t.toolkit_id AND tk.slug = $2
             WHERE tv.status = 'PUBLISHED'
             ORDER BY tv.version DESC
             LIMIT 1`,
            [body.tool_slug, body.toolkit_slug],
          );

      const toolVersion = tvRows[0];
      if (!toolVersion) {
        throw new NotFoundError('Tool', `${body.toolkit_slug}/${body.tool_slug}`);
      }

      // ── Step 2: Resolve connection (must be ACTIVE) ──────────────────────────────
      const { rows: connRows } = await db.query<{
        id: string;
        external_user_id: string;
        status: string;
        toolkit_id: string;
      }>(
        `SELECT ca.id, eu.external_user_id, ca.status, ca.toolkit_id
         FROM connected_accounts ca
         JOIN external_users eu ON eu.id = ca.external_user_id
         WHERE ca.id = $1 AND ca.environment_id = $2`,
        [body.connection_id, environmentId],
      );

      const connection = connRows[0];
      if (!connection) throw new NotFoundError('Connection', body.connection_id);

      if (connection.status !== 'ACTIVE') {
        throw new ForbiddenError(
          `Connection is ${connection.status} — reconnect required`,
        );
      }

      // ── Step 3: POLICY CHECK (SI-04 — BEFORE credential resolution) ─────────────
      const toolSlugFull = `${body.toolkit_slug}.${body.tool_slug}`;

      // Evaluate all active policies for this environment (Phase 2-A)
      const policyResult = await evaluatePolicy(db, {
        environment_id: environmentId,
        tool_slug: body.tool_slug,
        toolkit_slug: body.toolkit_slug,
        connection_id: body.connection_id,
        input: body.input,
        session_id: body.session_id,
      });
      const policyDecision = policyResult.decision;
      const policyReason = policyResult.reason;

      if (policyDecision === 'DENY') {
        // Write failed audit event immediately — credentials never loaded
        await writeAuditEvent(db, {
          id: generateId(),
          execution_id: executionId,
          environment_id: environmentId,
          event_type: 'EXECUTION_DENIED',
          actor_type: req.apiKey ? 'API_KEY' : 'SESSION',
          actor_id: req.apiKey?.id ?? (req.session?.id as UUIDv7),
          metadata: { tool: toolSlugFull, reason: policyReason },
        });
        throw new PolicyDeniedError(toolSlugFull, policyReason ?? undefined);
      }

      if (policyDecision === 'REQUIRE_CONFIRMATION') {
        await writeAuditEvent(db, {
          id: generateId(),
          execution_id: executionId,
          environment_id: environmentId,
          event_type: 'EXECUTION_PENDING_CONFIRMATION',
          actor_type: req.apiKey ? 'API_KEY' : 'SESSION',
          actor_id: req.apiKey?.id ?? (req.session?.id as UUIDv7),
          metadata: { tool: toolSlugFull },
        });
        throw new PolicyRequiresConfirmationError(toolSlugFull);
      }

      // ── Step 4: Write AUTHORIZING audit event (SI-11) ────────────────────────────
      await writeAuditEvent(db, {
        id: generateId(),
        execution_id: executionId,
        environment_id: environmentId,
        event_type: 'EXECUTION_AUTHORIZING',
        actor_type: req.apiKey ? 'API_KEY' : 'SESSION',
        actor_id: req.apiKey?.id ?? (req.session?.id as UUIDv7),
        metadata: {
          tool: toolSlugFull,
          tool_version_id: toolVersion.tool_version_id,
          connection_id: body.connection_id,
          risk_level: toolVersion.risk_level,
        },
      });

      // ── Step 5: Create execution record ──────────────────────────────────────────
      await db.query(
        `INSERT INTO executions
           (id, environment_id, tool_version_id, connection_id, session_id,
            status, input_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'AUTHORIZING', encode(sha256($6::bytea), 'hex'), NOW(), NOW())`,
        [
          executionId,
          environmentId,
          toolVersion.tool_version_id,
          body.connection_id,
          body.session_id ?? null,
          JSON.stringify(body.input),
        ],
      );

      // ── Step 6: Publish NATS job → connector-runtime ─────────────────────────────
      // connector-runtime is the ONLY component that resolves credentials (SI-02)
      // It will: load secret_reference → call KMS → decrypt → execute → encrypt response
      //
      // TODO Phase 3: publish to NATS JetStream
      // const nc = getNatsConnection();
      // await nc.publish('executions.run', codec.encode({
      //   execution_id: executionId,
      //   tool_version_id: toolVersion.tool_version_id,
      //   connection_id: body.connection_id,
      //   input: body.input,  // SI-01: No credentials here
      // }));

      // For Phase 1-C, return EXECUTING status synchronously
      // Phase 3 will add NATS publish + result streaming
      return reply.status(202).send({
        execution_id: executionId,
        status: 'AUTHORIZING',
        tool: toolSlugFull,
        tool_version: toolVersion.version,
        message: 'Execution accepted. Poll /executions/{id} for status.',
      });
    },
  );

  // ─── GET /executions/:id — poll execution status ──────────────────────────────

  fastify.get(
    '/executions/:id',
    {
      schema: {
        tags: ['executions'],
        summary: 'Get execution status and result',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey && !req.session) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
      }

      const { id } = req.params as { id: string };
      const db = getPool();

      const { rows } = await db.query<{
        id: string;
        status: ExecutionStatus;
        tool_version_id: string;
        connection_id: string;
        session_id: string | null;
        output: Record<string, unknown> | null;
        error_code: string | null;
        error_message: string | null;
        started_at: Date | null;
        completed_at: Date | null;
        created_at: Date;
      }>(
        `SELECT id, status, tool_version_id, connection_id, session_id,
                output, error_code, error_message, started_at, completed_at, created_at
         FROM executions
         WHERE id = $1 AND environment_id = $2`,
        [id, req.environmentId],
      );

      const row = rows[0];
      if (!row) throw new NotFoundError('Execution', id);

      return reply.send({
        id: row.id,
        status: row.status,
        tool_version_id: row.tool_version_id,
        connection_id: row.connection_id,
        session_id: row.session_id,
        // SI-01: output is provider response, never includes credentials
        // SI-07: output was validated by connector-runtime before storage
        output: row.output,
        error: row.error_code
          ? { code: row.error_code, message: row.error_message }
          : null,
        started_at: row.started_at?.toISOString() ?? null,
        completed_at: row.completed_at?.toISOString() ?? null,
        created_at: row.created_at.toISOString(),
      });
    },
  );

  // ─── GET /executions — list execution history ─────────────────────────────────

  fastify.get(
    '/executions',
    {
      schema: {
        tags: ['executions'],
        summary: 'List execution history',
        querystring: {
          type: 'object',
          properties: {
            connection_id: { type: 'string' },
            session_id: { type: 'string' },
            status: { type: 'string' },
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

      const { connection_id, session_id, status, limit = 20, cursor } = req.query as {
        connection_id?: string;
        session_id?: string;
        status?: string;
        limit?: number;
        cursor?: string;
      };

      const db = getPool();
      const params: unknown[] = [req.environmentId, Math.min(limit + 1, 101)];
      const conditions = ['environment_id = $1'];
      let idx = 3;

      if (cursor) { conditions.push(`id < $${idx++}`); params.push(cursor); }
      if (connection_id) { conditions.push(`connection_id = $${idx++}`); params.push(connection_id); }
      if (session_id) { conditions.push(`session_id = $${idx++}`); params.push(session_id); }
      if (status) { conditions.push(`status = $${idx++}`); params.push(status.toUpperCase()); }

      const { rows } = await db.query<{
        id: string;
        status: string;
        tool_version_id: string;
        connection_id: string;
        started_at: Date | null;
        completed_at: Date | null;
        created_at: Date;
      }>(
        `SELECT id, status, tool_version_id, connection_id, started_at, completed_at, created_at
         FROM executions
         WHERE ${conditions.join(' AND ')}
         ORDER BY id DESC
         LIMIT $2`,
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface AuditEventInput {
  id: UUIDv7;
  execution_id: UUIDv7;
  environment_id: UUIDv7;
  event_type: string;
  actor_type: string;
  actor_id: UUIDv7;
  metadata: Record<string, unknown>;
}

/** SI-10: audit_events is append-only. Only INSERT is used here. */
async function writeAuditEvent(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  event: AuditEventInput,
): Promise<void> {
  await db.query(
    `INSERT INTO audit_events
       (id, execution_id, environment_id, event_type, actor_type, actor_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      event.id,
      event.execution_id,
      event.environment_id,
      event.event_type,
      event.actor_type,
      event.actor_id,
      JSON.stringify(event.metadata),
    ],
  );
}
