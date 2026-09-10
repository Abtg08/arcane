/**
 * Organization, Project, Environment, User, Member schemas.
 * Canonical definitions — do NOT duplicate in dashboard/API/SDK.
 */

import { z } from 'zod';
import { UUIDv7Schema, SlugSchema, DateTimeSchema, MetadataSchema } from '../common.js';

// ─── Organization ──────────────────────────────────────────────────────────────

export const OrgStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']);
export type OrgStatus = z.infer<typeof OrgStatusSchema>;

export const OrganizationSchema = z.object({
  id: UUIDv7Schema,
  name: z.string().min(1).max(255),
  slug: SlugSchema,
  status: OrgStatusSchema,
  metadata: MetadataSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  slug: SlugSchema,
  metadata: MetadataSchema.optional(),
});
export type CreateOrganization = z.infer<typeof CreateOrganizationSchema>;

// ─── Project ──────────────────────────────────────────────────────────────────

export const ProjectStatusSchema = z.enum(['ACTIVE', 'ARCHIVED', 'DELETED']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectSchema = z.object({
  id: UUIDv7Schema,
  organization_id: UUIDv7Schema,
  name: z.string().min(1).max(255),
  slug: SlugSchema,
  description: z.string().max(1000).nullable(),
  status: ProjectStatusSchema,
  metadata: MetadataSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  slug: SlugSchema,
  description: z.string().max(1000).optional(),
  metadata: MetadataSchema.optional(),
});
export type CreateProject = z.infer<typeof CreateProjectSchema>;

// ─── Environment ──────────────────────────────────────────────────────────────

export const EnvironmentTypeSchema = z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION', 'CUSTOM']);
export type EnvironmentType = z.infer<typeof EnvironmentTypeSchema>;

export const EnvironmentStatusSchema = z.enum(['ACTIVE', 'ARCHIVED', 'DELETED']);
export type EnvironmentStatus = z.infer<typeof EnvironmentStatusSchema>;

export const EnvironmentSchema = z.object({
  id: UUIDv7Schema,
  project_id: UUIDv7Schema,
  name: z.string().min(1).max(255),
  slug: SlugSchema,
  type: EnvironmentTypeSchema,
  status: EnvironmentStatusSchema,
  metadata: MetadataSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type Environment = z.infer<typeof EnvironmentSchema>;

export const CreateEnvironmentSchema = z.object({
  name: z.string().min(1).max(255),
  slug: SlugSchema,
  type: EnvironmentTypeSchema,
  metadata: MetadataSchema.optional(),
});
export type CreateEnvironment = z.infer<typeof CreateEnvironmentSchema>;

// ─── Platform User ────────────────────────────────────────────────────────────
// NOT the same as ExternalUser. Platform users manage the dashboard.

export const UserStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const UserSchema = z.object({
  id: UUIDv7Schema,
  email: z.string().email(),
  name: z.string().min(1).max(255),
  status: UserStatusSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type User = z.infer<typeof UserSchema>;

// ─── Organization Member ──────────────────────────────────────────────────────

export const MemberRoleSchema = z.enum(['OWNER', 'ADMIN', 'MEMBER']);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const OrganizationMemberSchema = z.object({
  organization_id: UUIDv7Schema,
  user_id: UUIDv7Schema,
  role: MemberRoleSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type OrganizationMember = z.infer<typeof OrganizationMemberSchema>;

// ─── External User ────────────────────────────────────────────────────────────
// End-user of the integrating application. May never have platform credentials.

export const ExternalUserSchema = z.object({
  id: UUIDv7Schema,
  environment_id: UUIDv7Schema,
  external_user_id: z.string().min(1).max(255),
  metadata: MetadataSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type ExternalUser = z.infer<typeof ExternalUserSchema>;

export const CreateExternalUserSchema = z.object({
  external_user_id: z.string().min(1).max(255),
  metadata: MetadataSchema.optional(),
});
export type CreateExternalUser = z.infer<typeof CreateExternalUserSchema>;

// ─── API Key ──────────────────────────────────────────────────────────────────

export const ApiKeyPermissionSchema = z.enum(['READ', 'WRITE', 'EXECUTE', 'ADMIN']);
export type ApiKeyPermission = z.infer<typeof ApiKeyPermissionSchema>;

export const ApiKeySchema = z.object({
  id: UUIDv7Schema,
  environment_id: UUIDv7Schema,
  name: z.string().min(1).max(255),
  key_prefix: z.string(),
  // key_hash is NEVER returned in API responses
  permissions: z.array(ApiKeyPermissionSchema),
  created_at: DateTimeSchema,
  last_used_at: DateTimeSchema.nullable(),
  expires_at: DateTimeSchema.nullable(),
  revoked_at: DateTimeSchema.nullable(),
});
export type ApiKey = z.infer<typeof ApiKeySchema>;

// Returned ONCE at creation — plaintext never stored
export const ApiKeyCreatedSchema = ApiKeySchema.extend({
  key: z.string(), // e.g. "arc_live_xxxxxx" — shown once, then gone
});
export type ApiKeyCreated = z.infer<typeof ApiKeyCreatedSchema>;

export const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(255),
  permissions: z.array(ApiKeyPermissionSchema).min(1),
  expires_at: DateTimeSchema.optional(),
});
export type CreateApiKey = z.infer<typeof CreateApiKeySchema>;
