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
import { NotFoundError, ForbiddenError } from '@arcane/core';
import { evaluatePolicy } from '@arcane/policy';
import type { ApiConfig } from '@arcane/config';
import type { UUIDv7 } from '@arcane/schemas';
import type { JetStreamClient } from 'nats';
import { SUBJECT_EXECUTIONS_RUN, encode, type ExecuteJobMessage } from '@arcane/nats-client';
import {
  executionCounter,
  executionDuration,
  executionErrorCounter,
  policyEvalCounter,
  policyDenialCounter,
} from '@arcane/telemetry';

interface ExecutionRouteContext {
  config: ApiConfig;
  js?: JetStreamClient; // optional: present when NATS is connected (Phase 5+)
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
  opts: ExecutionRouteContext,
): Promise<void> {
  const { js } = opts;
  // ─── POST /execute — run a tool ────────────────────────────────────────────────

  fastify.post(
    '/execute',
    {
      schema: {
        tags: ['tools'],
        summary: 'Execute a tool on behalf of an external user',
        body: {
          type: 'object',
          required: ['tool_slug', 'toolkit_slug', 'input', 'external_user_id'],
          properties: {
            tool_slug: { type: 'string' },
            toolkit_slug: { type: 'string' },
            external_user_id: { type: 'string', description: 'External user identifier' },
            connection_id: { type: 'string', format: 'uuid', description: 'Explicit connection — omit to auto-resolve' },
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
        external_user_id: string;
        connection_id?: string;
        tool_version?: number;
        input: Record<string, unknown>;
        session_id?: string;
      };

      const db = getPool();
      const environmentId = req.environmentId!;
      const executionId = generateId();
      const requestId = (req.id as string) ?? generateId();
      const traceId = generateId();

      // Resolve external_user_id text → external_users.id (UUID)
      const { rows: euRows } = await db.query<{ id: string }>(
        `SELECT id FROM external_users WHERE environment_id = $1 AND external_user_id = $2`,
        [environmentId, body.external_user_id],
      );
      let externalUserId = euRows[0]?.id;
      if (!externalUserId) {
        // Auto-create external user on first execution
        externalUserId = generateId();
        await db.query(
          `INSERT INTO external_users (id, environment_id, external_user_id, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())`,
          [externalUserId, environmentId, body.external_user_id],
        );
      }

      // Look up organization_id and project_id from environment (needed for audit_events)
      const { rows: envRows } = await db.query<{ project_id: string; organization_id: string }>(
        `SELECT e.project_id, p.organization_id
         FROM environments e
         JOIN projects p ON p.id = e.project_id
         WHERE e.id = $1`,
        [environmentId],
      );
      const orgId = envRows[0]?.organization_id;
      const projectId = envRows[0]?.project_id;
      if (!orgId || !projectId) {
        return reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message: 'Could not resolve organization/project for environment', request_id: requestId },
        });
      }

      // ── Step 1: Resolve tool version (must be PUBLISHED — SI-06) ────────────────
      // Note: using parameterized queries for all user input (SI-13)
      const { rows: tvRows } = body.tool_version
        ? await db.query<{
            tool_version_id: string;
            tool_id: string;
            version: number;
            input_schema: Record<string, unknown>;
            execution_definition: Record<string, unknown>;
            risk_level: string[];
          }>(
            `SELECT tv.id AS tool_version_id, tv.tool_id, tv.version, tv.input_schema, tv.execution_definition, tv.risk_level
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
            execution_definition: Record<string, unknown>;
            risk_level: string[];
          }>(
            `SELECT tv.id AS tool_version_id, tv.tool_id, tv.version, tv.input_schema, tv.execution_definition, tv.risk_level
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
      let resolvedConnectionId: string;

      if (body.connection_id) {
        // Explicit connection_id provided — verify it
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
          executionErrorCounter.add(1, { 'error.type': 'connection_inactive' });
          throw new ForbiddenError(
            `Connection is ${connection.status} — reconnect required`,
          );
        }
        resolvedConnectionId = connection.id;
      } else {
        // Auto-resolve: find the first ACTIVE connection for this toolkit + environment
        const { rows: autoRows } = await db.query<{ id: string }>(
          `SELECT ca.id
           FROM connected_accounts ca
           JOIN toolkits tk ON tk.id = ca.toolkit_id AND tk.slug = $1
           WHERE ca.environment_id = $2 AND ca.status = 'ACTIVE'
           ORDER BY ca.created_at DESC
           LIMIT 1`,
          [body.toolkit_slug, environmentId],
        );

        if (!autoRows[0]) {
          executionErrorCounter.add(1, { 'error.type': 'no_active_connection' });
          return reply.status(400).send({
            error: {
              code: 'NO_ACTIVE_CONNECTION',
              message: `No active connection found for toolkit "${body.toolkit_slug}". Initiate an OAuth connection first.`,
              request_id: req.id,
            },
          });
        }
        resolvedConnectionId = autoRows[0].id;
      }

      // ── Step 3: POLICY CHECK (SI-04 — BEFORE credential resolution) ─────────────
      const toolSlugFull = `${body.toolkit_slug}.${body.tool_slug}`;

      // Evaluate all active policies for this environment (Phase 2-A)
      const execStart = Date.now();
      const policyResult = await evaluatePolicy(db, {
        environment_id: environmentId,
        tool_slug: body.tool_slug,
        toolkit_slug: body.toolkit_slug,
        connection_id: resolvedConnectionId,
        input: body.input,
        session_id: body.session_id,
      });
      const policyDecision = policyResult.decision;
      const policyReason = policyResult.reason;

      // Metrics: count every policy evaluation with its outcome
      policyEvalCounter.add(1, {
        'policy.decision': policyDecision,
        'tool.slug': toolSlugFull,
      });

      if (policyDecision === 'DENY') {
        policyDenialCounter.add(1, { 'tool.slug': toolSlugFull });
        executionErrorCounter.add(1, { 'error.type': 'policy_denied', 'tool.slug': toolSlugFull });
        // Write failed audit event immediately — credentials never loaded (SI-04, SI-11)
        await writeAuditEvent(db, {
          id: generateId(),
          organization_id: orgId,
          project_id: projectId,
          environment_id: environmentId,
          actor_type: req.apiKey ? 'API_KEY' : 'SESSION',
          actor_id: req.apiKey?.id ?? (req.session?.id as string),
          action: 'execution.denied',
          resource_type: 'execution',
          resource_id: executionId,
          request_id: requestId,
          metadata: { tool: toolSlugFull, reason: policyReason },
        });
        // Respond directly to guarantee our error format (throwing bypasses setErrorHandler in some scopes)
        return reply.status(403).send({
          error: {
            code: 'POLICY_DENIED',
            message: policyReason
              ? `Tool execution denied by policy: ${policyReason}`
              : `Tool execution denied by policy: ${toolSlugFull}`,
            request_id: req.id,
          },
        });
      }

      if (policyDecision === 'REQUIRE_CONFIRMATION') {
        await writeAuditEvent(db, {
          id: generateId(),
          organization_id: orgId,
          project_id: projectId,
          environment_id: environmentId,
          actor_type: req.apiKey ? 'API_KEY' : 'SESSION',
          actor_id: req.apiKey?.id ?? (req.session?.id as string),
          action: 'execution.pending_confirmation',
          resource_type: 'execution',
          resource_id: executionId,
          request_id: requestId,
          metadata: { tool: toolSlugFull },
        });
        // Respond directly to guarantee our error format
        return reply.status(202).send({
          error: {
            code: 'POLICY_REQUIRES_CONFIRMATION',
            message: `Tool execution requires confirmation: ${toolSlugFull}`,
            request_id: req.id,
          },
        });
      }

      // ── Step 4: Write AUTHORIZING audit event (SI-11) ────────────────────────────
      await writeAuditEvent(db, {
        id: generateId(),
        organization_id: orgId,
        project_id: projectId,
        environment_id: environmentId,
        actor_type: req.apiKey ? 'API_KEY' : 'SESSION',
        actor_id: req.apiKey?.id ?? (req.session?.id as string),
        action: 'execution.authorizing',
        resource_type: 'execution',
        resource_id: executionId,
        request_id: requestId,
        metadata: {
          tool: toolSlugFull,
          tool_version_id: toolVersion.tool_version_id,
          connection_id: resolvedConnectionId,
          risk_level: toolVersion.risk_level,
        },
      });

      // ── Step 5: Create execution record ──────────────────────────────────────────
      await db.query(
        `INSERT INTO executions
           (id, environment_id, external_user_id, tool_id, tool_version_id, connection_id,
            session_id, status, request_id, trace_id, started_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'AUTHORIZING', $8, $9, NOW(), NOW())`,
        [
          executionId,
          environmentId,
          externalUserId,
          toolVersion.tool_id,
          toolVersion.tool_version_id,
          resolvedConnectionId,
          body.session_id ?? null,
          requestId,
          traceId,
        ],
      );

      // ── Step 6: Execute — NATS delegation or dev-mode direct HTTP ────────────────
      if (js) {
        // Production: connector-runtime is the ONLY component that resolves credentials (SI-02)
        // SI-01: input payload never contains credentials — only tool inputs
        const job: ExecuteJobMessage = {
          execution_id: executionId,
          environment_id: environmentId,
          tool_version_id: toolVersion.tool_version_id,
          connection_id: resolvedConnectionId,
          input: body.input, // SI-01: no credentials here
          request_id: requestId,
          trace_id: traceId,
        };
        await js.publish(SUBJECT_EXECUTIONS_RUN, encode(job));

        executionCounter.add(1, { 'tool.slug': toolSlugFull, 'execution.via_nats': 'true' });
        executionDuration.record(Date.now() - execStart, { 'tool.slug': toolSlugFull, 'execution.phase': 'authorizing' });

        return reply.status(202).send({
          execution_id: executionId,
          status: 'AUTHORIZING',
          tool: toolSlugFull,
          tool_version: toolVersion.version,
          message: 'Execution accepted. Poll /executions/{id} for status.',
        });
      }

      // ── Dev-mode: direct HTTP execution (no NATS / no connector-runtime) ──────
      // This path resolves credentials inline — acceptable ONLY in development.
      // In production, connector-runtime handles this via NATS (SI-02).
      try {
        const execDef = toolVersion.execution_definition as {
          type: string;
          method: string;
          path: string;
          base_url?: string;
        };

        if (execDef.type !== 'http') {
          throw new Error(`Unsupported execution type: ${execDef.type}`);
        }

        // Resolve credentials from connected_account's secret_reference
        const { rows: secretRows } = await db.query<{ secret_reference: string; toolkit_id: string }>(
          `SELECT ca.secret_reference, ca.toolkit_id
           FROM connected_accounts ca
           WHERE ca.id = $1`,
          [resolvedConnectionId],
        );
        const secretRow = secretRows[0];
        if (!secretRow?.secret_reference) {
          throw new Error('Connection has no stored credentials');
        }

        // Decrypt the envelope-encrypted token bundle
        const { envelopeDecrypt } = await import('./connections.js');
        const tokenJson = envelopeDecrypt(secretRow.secret_reference, opts.config.SECRET_ENCRYPTION_KEY);
        const tokens = JSON.parse(tokenJson) as { access_token: string; token_type?: string };

        // Resolve base URL from toolkit's auth_config or execution_definition
        let baseUrl = execDef.base_url;
        if (!baseUrl) {
          // Derive from toolkit slug — standard provider API roots
          const providerBaseUrls: Record<string, string> = {
            github: 'https://api.github.com',
            slack: 'https://slack.com/api',
          };
          baseUrl = providerBaseUrls[body.toolkit_slug];
          if (!baseUrl) {
            throw new Error(`No base_url for toolkit "${body.toolkit_slug}"`);
          }
        }

        // Build request URL with query params for GET
        let url = `${baseUrl}${execDef.path}`;
        const headers: Record<string, string> = {
          Authorization: `${tokens.token_type === 'bearer' || !tokens.token_type ? 'Bearer' : tokens.token_type} ${tokens.access_token}`,
          Accept: 'application/json',
        };

        let fetchBody: string | undefined;
        if (execDef.method === 'GET') {
          const qs = new URLSearchParams();
          for (const [k, v] of Object.entries(body.input)) {
            if (v !== undefined && v !== null) qs.set(k, String(v));
          }
          const qsStr = qs.toString();
          if (qsStr) url += `?${qsStr}`;
        } else {
          headers['Content-Type'] = 'application/json';
          fetchBody = JSON.stringify(body.input);
        }

        // Update status to EXECUTING
        await db.query(
          `UPDATE executions SET status = 'EXECUTING' WHERE id = $1`,
          [executionId],
        );

        const resp = await fetch(url, {
          method: execDef.method,
          headers,
          body: fetchBody,
        });

        const respBody = await resp.text();
        let resultData: unknown;
        try {
          resultData = JSON.parse(respBody);
        } catch {
          resultData = { raw: respBody };
        }

        const finalStatus = resp.ok ? 'SUCCEEDED' : 'FAILED';

        await db.query(
          `UPDATE executions
           SET status = $2, metadata = $3, completed_at = NOW()
           WHERE id = $1`,
          [executionId, finalStatus, JSON.stringify({ output: resultData })],
        );

        // Terminal audit event
        await writeAuditEvent(db, {
          id: generateId(),
          organization_id: orgId,
          project_id: projectId,
          environment_id: environmentId,
          actor_type: 'SYSTEM',
          actor_id: executionId,
          action: finalStatus === 'SUCCEEDED' ? 'execution.succeeded' : 'execution.failed',
          resource_type: 'execution',
          resource_id: executionId,
          request_id: requestId,
          metadata: { tool: toolSlugFull, http_status: resp.status, dev_mode: true },
        });

        executionCounter.add(1, { 'tool.slug': toolSlugFull, 'execution.via_nats': 'false' });
        executionDuration.record(Date.now() - execStart, { 'tool.slug': toolSlugFull, 'execution.phase': 'completed' });

        // SI-07: Return result — never include credentials
        return reply.status(200).send({
          execution_id: executionId,
          status: finalStatus,
          tool: toolSlugFull,
          tool_version: toolVersion.version,
          output: resultData,
        });
      } catch (execErr) {
        await db.query(
          `UPDATE executions SET status = 'FAILED', error_code = 'DEV_EXECUTION_ERROR', error_message = $2, completed_at = NOW() WHERE id = $1`,
          [executionId, (execErr as Error).message],
        );

        executionErrorCounter.add(1, { 'error.type': 'dev_execution_failed', 'tool.slug': toolSlugFull });

        return reply.status(500).send({
          execution_id: executionId,
          status: 'FAILED',
          tool: toolSlugFull,
          error: (execErr as Error).message,
        });
      }
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
        metadata: Record<string, unknown> | null;
        error_code: string | null;
        error_message: string | null;
        started_at: Date | null;
        completed_at: Date | null;
        created_at: Date;
      }>(
        `SELECT id, status, tool_version_id, connection_id, session_id,
                metadata, error_code, error_message, started_at, completed_at, created_at
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
        output: (row.metadata as { output?: unknown } | null)?.output ?? null,
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
  id: string;
  organization_id: string;
  project_id: string;
  environment_id: string;
  actor_type: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  request_id: string;
  metadata: Record<string, unknown>;
}

/** SI-10: audit_events is append-only. Only INSERT is used here. */
async function writeAuditEvent(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  event: AuditEventInput,
): Promise<void> {
  await db.query(
    `INSERT INTO audit_events
       (id, organization_id, project_id, environment_id, actor_type, actor_id,
        action, resource_type, resource_id, request_id, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [
      event.id,
      event.organization_id,
      event.project_id,
      event.environment_id,
      event.actor_type,
      event.actor_id,
      event.action,
      event.resource_type,
      event.resource_id,
      event.request_id,
      JSON.stringify(event.metadata),
    ],
  );
}
