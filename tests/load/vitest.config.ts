/**
 * Vitest config for Phase 13 load tests.
 *
 * Same in-process strategy as the E2E suite.
 * Sequential (singleFork) to keep counter state predictable.
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    testTimeout: 120_000, // load rounds can take a while
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      '@arcane/schemas':           resolve(root, 'packages/schemas/src/index.ts'),
      '@arcane/config':            resolve(root, 'packages/config/src/index.ts'),
      '@arcane/core':              resolve(root, 'packages/core/src/index.ts'),
      '@arcane/telemetry':         resolve(root, 'packages/telemetry/src/index.ts'),
      '@arcane/auth':              resolve(root, 'packages/auth/src/index.ts'),
      '@arcane/policy':            resolve(root, 'packages/policy/src/index.ts'),
      '@arcane/search':            resolve(root, 'packages/search/src/index.ts'),
      '@arcane/nats-client':       resolve(root, 'packages/nats-client/src/index.ts'),
      '@arcane/connector-runtime': resolve(root, 'packages/connector-runtime/src/index.ts'),
      'ioredis': resolve(root, 'apps/api/node_modules/ioredis'),
    },
  },
});
