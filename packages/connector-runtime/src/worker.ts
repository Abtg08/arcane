/**
 * Connector-runtime worker — processes executions from NATS JetStream.
 *
 * Pipeline (per message):
 *   1. Ack the NATS message to prevent redelivery while processing
 *   2. Update execution status → RESOLVING
 *   3. Load tool version's execution_definition from DB
 *   4. Resolve credentials (SI-02 — only place unseal() is called)
 *   5. Execute HTTP call with SSRF guard (SI-08)
 *   6. Sanitize provider response (SI-07)
 *   7. Store sanitized output + update execution → SUCCEEDED or FAILED
 *   8. Write terminal audit event (SI-11)
 *   9. Publish result to NATS executions.result subject (for API to stream)
 *
 * Failure at any step → execution FAILED with error stored in DB.
 * Credentials never reach logs, DB output, or NATS result payload.
 */

import { connect, type NatsConnection, type JetStreamClient, StringCodec } from 'nats';
import { getPool, createSecretManager, type DbPool } from '@arcane/core';
import type { ConnectorRuntimeConfig } from '@arcane/config';
import { CredentialResolver } from './credential-resolver.js';
import { HttpExecutor, type ExecutionDefinition } from './http-executor.js';
import { sanitizeResponse } from './response-sanitizer.js';
import { buildSsrfGuard } from './ssrf.js';

// ── Message shape ─────────────────────────────────────────────────────────────

interface ExecuteJobMessage {
  execution_id: string;
  environment_id: string;
  tool_version_id: string;
  connection_id: string;
  input: Record<string, unknown>;
  request_id: string;
  trace_id: string;
}

interface ExecuteResultMessage {
  execution_id: string;
  status: 'SUCCEEDED' | 'FAILED';
  output: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  latency_ms: number;
}

// ── Worker ────────────────────────────────────────────────────────────────────

export class ConnectorRuntimeWorker {
  private nc?: NatsConnection;
  private js?: JetStreamClient;
  private readonly db: DbPool;
  private credentialResolver: CredentialResolver | undefined;
  private readonly httpExecutor: HttpExecutor;
  private readonly codec = StringCodec();

  constructor(private readonly config: ConnectorRuntimeConfig) {
    this.db = getPool();
    const ssrfGuard = buildSsrfGuard(config.SSRF_BLOCKED_CIDRS);
    this.httpExecutor = new HttpExecutor({
      ssrfGuard,
      timeoutMs: config.HTTP_TIMEOUT_MS,
      maxResponseBytes: config.HTTP_MAX_RESPONSE_BYTES,
    });
  }

  async start(): Promise<void> {
    // Build SecretManager from config (SI-02 — resolver holds the only reference)
    const secretManager = await createSecretManager({
      SECRET_BACKEND: this.config.SECRET_BACKEND,
      SECRET_ENCRYPTION_KEY: this.config.SECRET_ENCRYPTION_KEY,
      ...(this.config.KMS_KEY_ID !== undefined ? { KMS_KEY_ID: this.config.KMS_KEY_ID } : {}),
    });

    this.credentialResolver = new CredentialResolver(this.db, secretManager);

    // Connect to NATS
    this.nc = await connect({ servers: this.config.NATS_URL });
    this.js = this.nc.jetstream();

    console.info(`[connector-runtime] Connected to NATS at ${this.config.NATS_URL}`);

    // Subscribe to execution jobs
    const sub = await this.js.subscribe(this.config.NATS_SUBJECT_EXECUTE, {
      config: { durable_name: this.config.NATS_CONSUMER_GROUP },
    });

    console.info(
      `[connector-runtime] Listening on ${this.config.NATS_SUBJECT_EXECUTE} (consumer: ${this.config.NATS_CONSUMER_GROUP})`,
    );

    // Process messages with bounded concurrency
    const sem = new Semaphore(this.config.MAX_CONCURRENT_EXECUTIONS);

    for await (const msg of sub) {
      void sem.run(async () => {
        try {
          const job = JSON.parse(this.codec.decode(msg.data)) as ExecuteJobMessage;
          await this.processJob(job);
        } catch (err) {
          console.error('[connector-runtime] Failed to parse job message:', err);
        } finally {
          msg.ack();
        }
      });
    }
  }

  async stop(): Promise<void> {
    await this.nc?.drain();
    await this.nc?.close();
  }

  // ── Job processing ──────────────────────────────────────────────────────────

  private async processJob(job: ExecuteJobMessage): Promise<void> {
    const { execution_id, environment_id, tool_version_id, connection_id, input } = job;
    const startMs = Date.now();

    try {
      // Step 1: Mark RESOLVING
      await this.updateExecutionStatus(execution_id, 'RESOLVING');

      // Step 2: Load execution_definition from tool version
      const { rows: tvRows } = await this.db.query<{
        execution_definition: Record<string, unknown>;
        output_schema: Record<string, unknown>;
      }>(
        `SELECT execution_definition, output_schema FROM tool_versions WHERE id = $1`,
        [tool_version_id],
      );

      const tv = tvRows[0];
      if (!tv) {
        throw new Error(`tool_version ${tool_version_id} not found`);
      }

      // Step 3: Resolve credentials (SI-02)
      if (!this.credentialResolver) throw new Error('Worker not started — credentialResolver not initialized');
      const credential = await this.credentialResolver.resolve(connection_id, environment_id);

      // Step 4: Mark EXECUTING
      await this.updateExecutionStatus(execution_id, 'EXECUTING', { started_at: new Date() });

      // Step 5: HTTP execution with SSRF guard
      const def = tv.execution_definition as unknown as ExecutionDefinition;
      const httpResult = await this.httpExecutor.execute(def, input, credential);

      // Step 6: Sanitize response (SI-07)
      const sanitized = sanitizeResponse(
        httpResult.http_status,
        httpResult.body,
        tv.output_schema,
      );

      const latency_ms = Date.now() - startMs;

      // Step 7: Store result + update status
      if (sanitized.error) {
        await this.failExecution(execution_id, sanitized.error.code, sanitized.error.message, latency_ms);
      } else {
        await this.succeedExecution(execution_id, sanitized.output, latency_ms);
      }

      // Step 8: Terminal audit event
      await this.writeAuditEvent(execution_id, environment_id, sanitized.error ? 'EXECUTION_FAILED' : 'EXECUTION_SUCCEEDED', {
        latency_ms,
        http_status: httpResult.http_status,
        error: sanitized.error ?? undefined,
      });

      // Step 9: Publish result to NATS
      const result: ExecuteResultMessage = {
        execution_id,
        status: sanitized.error ? 'FAILED' : 'SUCCEEDED',
        output: sanitized.output,
        error: sanitized.error,
        latency_ms,
      };

      if (this.js) {
        await this.js.publish(
          this.config.NATS_SUBJECT_RESULT,
          this.codec.encode(JSON.stringify(result)),
        );
      }
    } catch (err) {
      const latency_ms = Date.now() - startMs;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[connector-runtime] Execution ${execution_id} failed:`, message);

      await this.failExecution(execution_id, 'INTERNAL_ERROR', message, latency_ms).catch(() => {});
      await this.writeAuditEvent(execution_id, environment_id, 'EXECUTION_FAILED', {
        latency_ms,
        error_code: 'INTERNAL_ERROR',
      }).catch(() => {});
    }
  }

  // ── DB helpers ──────────────────────────────────────────────────────────────

  private async updateExecutionStatus(
    executionId: string,
    status: string,
    extra: { started_at?: Date } = {},
  ): Promise<void> {
    if (extra.started_at) {
      await this.db.query(
        `UPDATE executions SET status = $1, started_at = $2, updated_at = NOW() WHERE id = $3`,
        [status, extra.started_at, executionId],
      );
    } else {
      await this.db.query(
        `UPDATE executions SET status = $1, updated_at = NOW() WHERE id = $2`,
        [status, executionId],
      );
    }
  }

  private async succeedExecution(
    executionId: string,
    output: Record<string, unknown> | null,
    latency_ms: number,
  ): Promise<void> {
    await this.db.query(
      `UPDATE executions
       SET status = 'SUCCEEDED', output = $1, latency_ms = $2,
           completed_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(output), latency_ms, executionId],
    );
  }

  private async failExecution(
    executionId: string,
    errorCode: string,
    errorMessage: string,
    latency_ms: number,
  ): Promise<void> {
    await this.db.query(
      `UPDATE executions
       SET status = 'FAILED', error_code = $1, error_message = $2,
           latency_ms = $3, completed_at = NOW(), updated_at = NOW()
       WHERE id = $4`,
      [errorCode, errorMessage.slice(0, 1000), latency_ms, executionId],
    );
  }

  private async writeAuditEvent(
    executionId: string,
    environmentId: string,
    eventType: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    // SI-10: append-only INSERT
    await this.db.query(
      `INSERT INTO audit_events
         (id, execution_id, environment_id, event_type, actor_type, actor_id, metadata, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'SYSTEM', 'connector-runtime', $4, NOW())`,
      [executionId, environmentId, eventType, JSON.stringify(metadata)],
    );
  }
}

// ── Semaphore — bounded concurrency ──────────────────────────────────────────

class Semaphore {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = () => {
        this.running++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            this.running--;
            const next = this.queue.shift();
            if (next) next();
          });
      };

      if (this.running < this.max) {
        execute();
      } else {
        this.queue.push(execute);
      }
    });
  }
}
