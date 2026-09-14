/**
 * Vitest config for Phase 10 security acceptance tests.
 *
 * Imports buildApp() directly from source (no dist needed).
 * All workspace packages resolved via aliases.
 * No real DB, no real Redis — mocked in each test.
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.security.test.ts'],
    testTimeout: 15000,
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
    },
  },
});
