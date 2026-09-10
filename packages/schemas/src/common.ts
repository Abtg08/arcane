/**
 * Common primitives used across all schemas.
 * UUIDv7 for all externally-visible IDs (section 9 of master arch).
 */

import { z } from 'zod';

// UUIDv7 — time-sortable, used for all persistent IDs
// Regex: version bits = 7, variant bits = 8,9,a,b
export const UUIDv7Schema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'Must be a valid UUIDv7',
  );

export type UUIDv7 = z.infer<typeof UUIDv7Schema>;

// Opaque cursor for pagination — never expose internals
export const CursorSchema = z.string().min(1);
export type Cursor = z.infer<typeof CursorSchema>;

// Slug — URL-safe identifier
export const SlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Must be lowercase alphanumeric with hyphens');
export type Slug = z.infer<typeof SlugSchema>;

// ISO 8601 datetime — always UTC (TIMESTAMPTZ in DB)
export const DateTimeSchema = z.string().datetime({ offset: true });
export type DateTime = z.infer<typeof DateTimeSchema>;

// Pagination request
export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: CursorSchema.optional(),
});
export type Pagination = z.infer<typeof PaginationSchema>;

// Paginated response wrapper
export function paginatedResponse<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    next_cursor: CursorSchema.nullable(),
    has_more: z.boolean(),
  });
}

// Standard API error (section 13 of master arch)
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// Metadata — arbitrary JSONB on most entities
export const MetadataSchema = z.record(z.unknown()).nullable().default(null);
export type Metadata = z.infer<typeof MetadataSchema>;

// Secret reference — opaque string stored in DB instead of plaintext secret
export const SecretReferenceSchema = z.string().min(1).brand<'SecretReference'>();
export type SecretReference = z.infer<typeof SecretReferenceSchema>;
