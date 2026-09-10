/**
 * Entity factories for tests — generate valid, populated test objects.
 * Use these instead of hand-rolling fixtures.
 */

import { uuidv7 } from 'uuidv7';
import type { UUIDv7 } from '@arcane/schemas';

function id(): UUIDv7 {
  return uuidv7() as UUIDv7;
}

export const factories = {
  organization: (overrides: Record<string, unknown> = {}) => ({
    id: id(),
    name: 'Test Org',
    slug: 'test-org',
    plan: 'FREE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),

  project: (orgId: UUIDv7, overrides: Record<string, unknown> = {}) => ({
    id: id(),
    organization_id: orgId,
    name: 'Test Project',
    slug: 'test-project',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),

  environment: (projectId: UUIDv7, overrides: Record<string, unknown> = {}) => ({
    id: id(),
    project_id: projectId,
    name: 'test',
    is_production: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),

  user: (orgId: UUIDv7, overrides: Record<string, unknown> = {}) => ({
    id: id(),
    organization_id: orgId,
    email: `test-${Date.now()}@example.com`,
    name: 'Test User',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),

  externalUser: (envId: UUIDv7, overrides: Record<string, unknown> = {}) => ({
    id: id(),
    environment_id: envId,
    external_id: `ext-${Date.now()}`,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),

  apiKey: (envId: UUIDv7, overrides: Record<string, unknown> = {}) => ({
    id: id(),
    environment_id: envId,
    name: 'Test API Key',
    key_prefix: 'arc_test_',
    key_hash: 'sha256:' + 'a'.repeat(64),
    status: 'ACTIVE' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }),
};
