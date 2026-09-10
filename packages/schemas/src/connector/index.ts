/**
 * Connector, Toolkit, Tool, Version, AuthConfig schemas.
 * Published versions are immutable — this is enforced in the registry.
 */

import { z } from 'zod';
import { UUIDv7Schema, SlugSchema, DateTimeSchema, MetadataSchema } from '../common.js';

// ─── Toolkit ──────────────────────────────────────────────────────────────────

export const ToolkitCategorySchema = z.enum([
  'COMMUNICATION',
  'PRODUCTIVITY',
  'DEVELOPER_TOOLS',
  'CRM',
  'FINANCE',
  'ECOMMERCE',
  'STORAGE',
  'CALENDAR',
  'OTHER',
]);
export type ToolkitCategory = z.infer<typeof ToolkitCategorySchema>;

export const ToolkitStatusSchema = z.enum(['ACTIVE', 'DEPRECATED', 'DISABLED']);
export type ToolkitStatus = z.infer<typeof ToolkitStatusSchema>;

export const ToolkitSchema = z.object({
  id: UUIDv7Schema,
  slug: SlugSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(2000),
  category: ToolkitCategorySchema,
  status: ToolkitStatusSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type Toolkit = z.infer<typeof ToolkitSchema>;

// ─── Toolkit Version ──────────────────────────────────────────────────────────

export const ToolkitVersionStatusSchema = z.enum([
  'DRAFT',
  'PUBLISHED',
  'DEPRECATED',
  'RETIRED',
]);
export type ToolkitVersionStatus = z.infer<typeof ToolkitVersionStatusSchema>;

export const ToolkitVersionSchema = z.object({
  id: UUIDv7Schema,
  toolkit_id: UUIDv7Schema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver e.g. 1.0.0'),
  manifest: z.record(z.unknown()), // Full manifest JSONB
  status: ToolkitVersionStatusSchema,
  published_at: DateTimeSchema.nullable(),
  deprecated_at: DateTimeSchema.nullable(),
  created_at: DateTimeSchema,
});
export type ToolkitVersion = z.infer<typeof ToolkitVersionSchema>;

// ─── Tool Risk Level ──────────────────────────────────────────────────────────

export const ToolRiskLevelSchema = z.enum([
  'READ_ONLY',
  'WRITE',
  'DESTRUCTIVE',
  'AUTHENTICATION',
  'EXTERNAL_COMMUNICATION',
  'FINANCIAL',
]);
export type ToolRiskLevel = z.infer<typeof ToolRiskLevelSchema>;

// ─── Tool ────────────────────────────────────────────────────────────────────

export const ToolStatusSchema = z.enum(['ACTIVE', 'DEPRECATED', 'RETIRED']);
export type ToolStatus = z.infer<typeof ToolStatusSchema>;

export const ToolSchema = z.object({
  id: UUIDv7Schema,
  toolkit_id: UUIDv7Schema,
  slug: SlugSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(4000), // Untrusted — see arch section 30
  status: ToolStatusSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type Tool = z.infer<typeof ToolSchema>;

// ─── Tool Version ─────────────────────────────────────────────────────────────

export const ToolVersionStatusSchema = z.enum([
  'DRAFT',
  'PUBLISHED',
  'DEPRECATED',
  'RETIRED',
]);
export type ToolVersionStatus = z.infer<typeof ToolVersionStatusSchema>;

export const ToolVersionSchema = z.object({
  id: UUIDv7Schema,
  tool_id: UUIDv7Schema,
  toolkit_version_id: UUIDv7Schema,
  version: z.number().int().positive(), // Monotonic integer version
  input_schema: z.record(z.unknown()), // JSON Schema
  output_schema: z.record(z.unknown()), // JSON Schema
  execution_definition: z.record(z.unknown()), // Declarative or programmatic def
  risk_level: z.array(ToolRiskLevelSchema).min(1),
  read_only: z.boolean(),
  destructive: z.boolean(),
  idempotent: z.boolean(),
  status: ToolVersionStatusSchema,
  created_at: DateTimeSchema,
  published_at: DateTimeSchema.nullable(),
  deprecated_at: DateTimeSchema.nullable(),
});
export type ToolVersion = z.infer<typeof ToolVersionSchema>;

// ─── Auth Config ──────────────────────────────────────────────────────────────

export const AuthTypeSchema = z.enum([
  'OAUTH2',
  'OAUTH2_PKCE',
  'API_KEY',
  'BASIC',
  'CUSTOM',
]);
export type AuthType = z.infer<typeof AuthTypeSchema>;

export const AuthConfigSchema = z.object({
  id: UUIDv7Schema,
  toolkit_id: UUIDv7Schema,
  name: z.string().min(1).max(255),
  auth_type: AuthTypeSchema,
  configuration_schema: z.record(z.unknown()), // What fields the user must provide
  authorization_config: z.record(z.unknown()), // OAuth endpoints, scopes, etc. — NO secrets
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

// ─── Connected Account ────────────────────────────────────────────────────────

export const ConnectionStatusSchema = z.enum([
  'PENDING',
  'ACTIVE',
  'EXPIRED',
  'REAUTH_REQUIRED',
  'REVOKED',
  'ERROR',
]);
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

export const ConnectedAccountSchema = z.object({
  id: UUIDv7Schema,
  environment_id: UUIDv7Schema,
  external_user_id: UUIDv7Schema,
  toolkit_id: UUIDv7Schema,
  auth_config_id: UUIDv7Schema,
  status: ConnectionStatusSchema,
  // secret_reference is an opaque ref — NEVER the secret itself
  secret_reference: z.string().nullable(), // null while PENDING
  provider_account_id: z.string().nullable(),
  metadata: MetadataSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
  expires_at: DateTimeSchema.nullable(),
  last_used_at: DateTimeSchema.nullable(),
});
export type ConnectedAccount = z.infer<typeof ConnectedAccountSchema>;

// ─── Connector Manifest ───────────────────────────────────────────────────────

export const ConnectorManifestSchema = z.object({
  id: SlugSchema,
  name: z.string().min(1),
  slug: SlugSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string(),
  category: ToolkitCategorySchema,
  documentation: z.string().url().optional(),
  base_urls: z.array(z.string().url()),
  authentication: z.array(
    z.object({
      type: AuthTypeSchema,
      name: z.string(),
      scopes: z.array(z.string()).optional(),
    }),
  ),
  tools: z.array(z.record(z.unknown())), // Tool definitions
  pagination: z.record(z.unknown()).optional(),
  rate_limits: z.record(z.unknown()).optional(),
  retry_policy: z.record(z.unknown()).optional(),
  webhooks: z.array(z.record(z.unknown())).optional(),
  normalization: z.record(z.unknown()).optional(),
  health_checks: z.array(z.record(z.unknown())).optional(),
});
export type ConnectorManifest = z.infer<typeof ConnectorManifestSchema>;
