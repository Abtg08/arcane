/**
 * Session schemas.
 * Sessions are short-lived runtime identities — they NEVER store secrets.
 */

import { z } from 'zod';
import { UUIDv7Schema, DateTimeSchema, MetadataSchema } from '../common.js';

export const SessionStatusSchema = z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSchema = z.object({
  id: UUIDv7Schema,
  environment_id: UUIDv7Schema,
  external_user_id: UUIDv7Schema,
  status: SessionStatusSchema,
  expires_at: DateTimeSchema,
  metadata: MetadataSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type Session = z.infer<typeof SessionSchema>;

export const SessionToolSchema = z.object({
  session_id: UUIDv7Schema,
  tool_id: UUIDv7Schema,
  connection_id: UUIDv7Schema,
});
export type SessionTool = z.infer<typeof SessionToolSchema>;

export const CreateSessionSchema = z.object({
  external_user_id: z.string().min(1).max(255), // Provider-facing ID
  tools: z
    .array(
      z.object({
        tool_id: UUIDv7Schema,
        connection_id: UUIDv7Schema,
      }),
    )
    .optional(),
  expires_in_seconds: z.number().int().positive().max(86400).default(3600), // 1hr default, max 24hr
  metadata: MetadataSchema.optional(),
});
export type CreateSession = z.infer<typeof CreateSessionSchema>;
