/**
 * @arcane/nats-client
 *
 * Shared NATS JetStream setup for all Arcane services.
 *
 * Stream definitions (created once on first connect):
 *   EXECUTIONS  — subjects: executions.run, executions.result
 *   WEBHOOKS    — subjects: webhooks.received, webhooks.deliver
 *
 * Architectural invariants:
 *   - Durable consumers are named per-service (connector-runtime, trigger-worker)
 *   - All messages are JSON, encoded as UTF-8 strings
 *   - Stream retention: WorkQueuePolicy so each message is consumed once
 *   - At-least-once delivery; idempotency keys in payloads
 */

import { connect, RetentionPolicy, StorageType, type NatsConnection, type JetStreamClient, StringCodec } from 'nats';

// ── Stream names ──────────────────────────────────────────────────────────────

export const STREAM_EXECUTIONS = 'EXECUTIONS';
export const STREAM_WEBHOOKS = 'WEBHOOKS';

// ── Subject constants ─────────────────────────────────────────────────────────

/** Connector-runtime subscribes: run a tool execution */
export const SUBJECT_EXECUTIONS_RUN = 'executions.run';
/** API streams back results to callers */
export const SUBJECT_EXECUTIONS_RESULT = 'executions.result';
/** Webhook ingress publishes new inbound events */
export const SUBJECT_WEBHOOKS_RECEIVED = 'webhooks.received';
/** Trigger-worker publishes deliveries to fan out */
export const SUBJECT_WEBHOOKS_DELIVER = 'webhooks.deliver';

// ── Consumer group names ──────────────────────────────────────────────────────

export const CONSUMER_CONNECTOR_RUNTIME = 'connector-runtime';
export const CONSUMER_TRIGGER_WORKER = 'trigger-worker';

// ── Codec (shared) ────────────────────────────────────────────────────────────

export const codec = StringCodec();

// ── Connection manager ────────────────────────────────────────────────────────

export interface NatsClientOptions {
  url: string;
  /** Milliseconds to wait for connection before throwing */
  connectTimeoutMs?: number;
}

export interface ArcaneNats {
  nc: NatsConnection;
  js: JetStreamClient;
  close(): Promise<void>;
}

/**
 * Connect to NATS and ensure JetStream streams exist.
 * Safe to call concurrently — stream add is idempotent.
 */
export async function connectNats(opts: NatsClientOptions): Promise<ArcaneNats> {
  const nc = await connect({
    servers: opts.url,
    timeout: opts.connectTimeoutMs ?? 10_000,
  });

  const jsm = await nc.jetstreamManager();

  // EXECUTIONS stream
  try {
    await jsm.streams.add({
      name: STREAM_EXECUTIONS,
      subjects: [SUBJECT_EXECUTIONS_RUN, SUBJECT_EXECUTIONS_RESULT],
      retention: RetentionPolicy.Workqueue,
      storage: StorageType.File,
      max_age: 86_400 * 1_000_000_000, // 24h in nanoseconds
      num_replicas: 1,
    });
  } catch {
    // Stream already exists — ignore
  }

  // WEBHOOKS stream
  try {
    await jsm.streams.add({
      name: STREAM_WEBHOOKS,
      subjects: [SUBJECT_WEBHOOKS_RECEIVED, SUBJECT_WEBHOOKS_DELIVER],
      retention: RetentionPolicy.Workqueue,
      storage: StorageType.File,
      max_age: 86_400 * 7 * 1_000_000_000, // 7 days
      num_replicas: 1,
    });
  } catch {
    // Stream already exists — ignore
  }

  const js = nc.jetstream();

  return {
    nc,
    js,
    async close() {
      await nc.drain();
      await nc.close();
    },
  };
}

// ── Message type helpers ──────────────────────────────────────────────────────

/** Encode a typed payload to Uint8Array for NATS publish */
export function encode<T>(payload: T): Uint8Array {
  return codec.encode(JSON.stringify(payload));
}

/** Decode a NATS message data to a typed payload */
export function decode<T>(data: Uint8Array): T {
  return JSON.parse(codec.decode(data)) as T;
}

// ── Canonical message shapes ──────────────────────────────────────────────────

export interface ExecuteJobMessage {
  execution_id: string;
  environment_id: string;
  tool_version_id: string;
  connection_id: string;
  input: Record<string, unknown>;
  request_id: string;
  trace_id: string;
}

export interface ExecuteResultMessage {
  execution_id: string;
  status: 'SUCCEEDED' | 'FAILED';
  output: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
  latency_ms: number;
}

export interface WebhookReceivedMessage {
  event_id: string;
  environment_id: string;
  trigger_id: string;
  provider_event_id: string | null;
  payload_hash: string;
  /** Object storage reference — actual payload fetched by worker */
  payload_reference: string | null;
  /** Inline payload (small events only, <8KB) */
  payload_inline: Record<string, unknown> | null;
  received_at: string; // ISO 8601
}

export interface WebhookDeliverMessage {
  delivery_id: string;
  event_id: string;
  destination_id: string;
  destination_url: string;
  payload: Record<string, unknown>;
  attempt_number: number;
  /** HMAC signing key reference — worker resolves and signs */
  secret_reference: string | null;
}
