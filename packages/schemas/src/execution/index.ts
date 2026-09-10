/**
 * Execution, ExecutionAttempt, AuditEvent, UsageRecord schemas.
 * Execution records are append-only — no updates, no deletes.
 */

import { z } from 'zod';
import { UUIDv7Schema, DateTimeSchema, MetadataSchema } from '../common.js';

// ─── Execution Status (state machine — section 21) ─────────────────────────────

export const ExecutionStatusSchema = z.enum([
  'CREATED',
  'AUTHORIZING',
  'RESOLVING',
  'EXECUTING',
  'SUCCEEDED',
  'RETRYING',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

// Valid state transitions — enforced in the execution gateway
export const EXECUTION_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
  CREATED: ['AUTHORIZING'],
  AUTHORIZING: ['RESOLVING', 'FAILED'],
  RESOLVING: ['EXECUTING', 'FAILED'],
  EXECUTING: ['SUCCEEDED', 'RETRYING', 'FAILED', 'CANCELLED', 'TIMED_OUT'],
  RETRYING: ['EXECUTING', 'FAILED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
  TIMED_OUT: [],
};

export function isValidTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  return EXECUTION_TRANSITIONS[from].includes(to);
}

// ─── Execution ────────────────────────────────────────────────────────────────

export const ExecutionSchema = z.object({
  id: UUIDv7Schema,
  environment_id: UUIDv7Schema,
  session_id: UUIDv7Schema,
  external_user_id: UUIDv7Schema,
  tool_id: UUIDv7Schema,
  tool_version_id: UUIDv7Schema,
  connection_id: UUIDv7Schema,
  status: ExecutionStatusSchema,
  started_at: DateTimeSchema,
  completed_at: DateTimeSchema.nullable(),
  latency_ms: z.number().int().nonnegative().nullable(),
  request_id: z.string(),
  trace_id: z.string(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  metadata: MetadataSchema,
  created_at: DateTimeSchema,
});
export type Execution = z.infer<typeof ExecutionSchema>;

// ─── Execution Attempt ────────────────────────────────────────────────────────
// Immutable — a retry creates a NEW attempt record, never overwrites

export const AttemptStatusSchema = z.enum([
  'PENDING',
  'EXECUTING',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
]);
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;

export const ExecutionAttemptSchema = z.object({
  id: UUIDv7Schema,
  execution_id: UUIDv7Schema,
  attempt_number: z.number().int().positive(),
  started_at: DateTimeSchema,
  completed_at: DateTimeSchema.nullable(),
  status: AttemptStatusSchema,
  http_status: z.number().int().nullable(),
  error_code: z.string().nullable(),
  latency_ms: z.number().int().nonnegative().nullable(),
  metadata: MetadataSchema,
});
export type ExecutionAttempt = z.infer<typeof ExecutionAttemptSchema>;

// ─── Execute Request / Response ───────────────────────────────────────────────

export const ExecuteRequestSchema = z.object({
  tool: z.string(), // e.g. "github.create_issue" or tool_id
  version: z.number().int().positive().optional(), // specific version or latest published
  input: z.record(z.unknown()), // validated against tool's input_schema
  connection_id: UUIDv7Schema.optional(), // explicit connection, or resolved from session
  idempotency_key: z.string().max(128).optional(),
});
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;

export const ExecuteResponseSchema = z.object({
  execution_id: UUIDv7Schema,
  status: ExecutionStatusSchema,
  output: z.unknown().nullable(), // sanitized provider response
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
  latency_ms: z.number().int().nonnegative(),
  request_id: z.string(),
  trace_id: z.string(),
});
export type ExecuteResponse = z.infer<typeof ExecuteResponseSchema>;

// ─── Audit Event ──────────────────────────────────────────────────────────────
// Append-only. Never mutated.

export const AuditActorTypeSchema = z.enum(['USER', 'API_KEY', 'SYSTEM', 'EXTERNAL_USER']);
export type AuditActorType = z.infer<typeof AuditActorTypeSchema>;

export const AuditEventSchema = z.object({
  id: UUIDv7Schema,
  organization_id: UUIDv7Schema,
  project_id: UUIDv7Schema,
  environment_id: UUIDv7Schema,
  actor_type: AuditActorTypeSchema,
  actor_id: z.string(),
  action: z.string(), // e.g. "execution.created", "connection.revoked"
  resource_type: z.string(),
  resource_id: z.string(),
  request_id: z.string(),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  metadata: MetadataSchema,
  created_at: DateTimeSchema,
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

// ─── Usage Record ─────────────────────────────────────────────────────────────

export const UsageMetricSchema = z.enum(['EXECUTION', 'TOKEN', 'WEBHOOK_DELIVERY']);
export type UsageMetric = z.infer<typeof UsageMetricSchema>;

export const UsageRecordSchema = z.object({
  id: UUIDv7Schema,
  organization_id: UUIDv7Schema,
  environment_id: UUIDv7Schema,
  metric: UsageMetricSchema,
  quantity: z.number().int().positive(),
  execution_id: UUIDv7Schema.nullable(),
  created_at: DateTimeSchema,
});
export type UsageRecord = z.infer<typeof UsageRecordSchema>;
