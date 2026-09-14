/**
 * Vitest config for Phase 10-B integration / E2E tests.
 *
 * Same in-process strategy as the security suite:
 * buildApp() imported directly from source, workspace packages aliased.
 * No real DB, Redis, or NATS — mocked per test.
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.e2e.test.ts'],
    testTimeout: 20000,
    // Sequential — steps share mutable state (connection status, policy mode)
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      '@arcane/schemas': resolve(root, 'packages/schemas/src/index.ts'),
      '@arcane/config': resolve(root, 'packages/config/src/index.ts'),
      '@arcane/core': resolve(root, 'packages/core/src/index.ts'),
      '@arcane/telemetry': resolve(root, 'packages/telemetry/src/index.ts'),
      '@arcane/auth': resolve(root, 'packages/auth/src/index.ts'),
      '@arcane/policy': resolve(root, 'packages/policy/src/index.ts'),
      '@arcane/search': resolve(root, 'packages/search/src/index.ts'),
      '@arcane/nats-client': resolve(root, 'packages/nats-client/src/index.ts'),
      '@arcane/connector-runtime': resolve(root, 'packages/connector-runtime/src/index.ts'),
      // Force all ioredis imports (api, auth, etc.) to the same module so vi.mock
      // can intercept all of them from a single mock factory.
      'ioredis': resolve(root, 'apps/api/node_modules/ioredis'),
    },
  },
});
