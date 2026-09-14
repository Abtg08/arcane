/**
 * Trigger, Event, Delivery schemas.
 * At-least-once delivery semantics — see arch section 28.
 */

import { z } from 'zod';
import { UUIDv7Schema, DateTimeSchema } from '../common.js';

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const TriggerStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'DELETED']);
export type TriggerStatus = z.infer<typeof TriggerStatusSchema>;

export const TriggerSchema = z.object({
  id: UUIDv7Schema,
  environment_id: UUIDv7Schema,
  toolkit_id: UUIDv7Schema,
  name: z.string().min(1).max(255),
  event_type: z.string(),
  status: TriggerStatusSchema,
  configuration: z.record(z.unknown()),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type Trigger = z.infer<typeof TriggerSchema>;

// ─── Trigger Subscription ─────────────────────────────────────────────────────

export const TriggerSubscriptionStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'DELETED']);

export const TriggerSubscriptionSchema = z.object({
  id: UUIDv7Schema,
  trigger_id: UUIDv7Schema,
  external_user_id: UUIDv7Schema,
  destination_id: UUIDv7Schema,
  status: TriggerSubscriptionStatusSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type TriggerSubscription = z.infer<typeof TriggerSubscriptionSchema>;

// ─── Event ────────────────────────────────────────────────────────────────────

export const EventStatusSchema = z.enum([
  'RECEIVED',
  'PROCESSING',
  'DELIVERED',
  'FAILED',
  'DEAD_LETTERED',
]);
export type EventStatus = z.infer<typeof EventStatusSchema>;

export const EventSchema = z.object({
  id: UUIDv7Schema,
  environment_id: UUIDv7Schema,
  provider_event_id: z.string().nullable(), // Provider's own event ID for dedup
  trigger_id: UUIDv7Schema,
  connection_id: UUIDv7Schema,
  received_at: DateTimeSchema,
  processed_at: DateTimeSchema.nullable(),
  attempt_count: z.number().int().nonnegative(),
  status: EventStatusSchema,
  payload_hash: z.string(), // For deduplication
  payload_reference: z.string().nullable(), // Object store ref for large payloads
  created_at: DateTimeSchema,
});
export type Event = z.infer<typeof EventSchema>;

// ─── Delivery ─────────────────────────────────────────────────────────────────

export const DeliveryStatusSchema = z.enum([
  'PENDING',
  'DELIVERING',
  'SUCCEEDED',
  'FAILED',
  'DEAD_LETTERED',
]);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;

export const DeliverySchema = z.object({
  id: UUIDv7Schema,
  event_id: UUIDv7Schema,
  destination_id: UUIDv7Schema,
  attempt_number: z.number().int().positive(),
  status: DeliveryStatusSchema,
  http_status: z.number().int().nullable(),
  started_at: DateTimeSchema,
  completed_at: DateTimeSchema.nullable(),
  next_retry_at: DateTimeSchema.nullable(),
  error_code: z.string().nullable(),
  created_at: DateTimeSchema,
});
export type Delivery = z.infer<typeof DeliverySchema>;

// ─── Webhook Destination ──────────────────────────────────────────────────────

export const WebhookDestinationStatusSchema = z.enum(['ACTIVE', 'DISABLED', 'DELETED']);

export const WebhookDestinationSchema = z.object({
  id: UUIDv7Schema,
  environment_id: UUIDv7Schema,
  url: z.string().url(),
  status: WebhookDestinationStatusSchema,
  secret_reference: z.string().nullable(), // For signing outbound deliveries
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type WebhookDestination = z.infer<typeof WebhookDestinationSchema>;
