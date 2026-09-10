import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/dist/**', '**/node_modules/**', '**/*.test.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@arcane/schemas': resolve(__dirname, 'packages/schemas/src/index.ts'),
      '@arcane/config': resolve(__dirname, 'packages/config/src/index.ts'),
      '@arcane/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@arcane/telemetry': resolve(__dirname, 'packages/telemetry/src/index.ts'),
      '@arcane/auth': resolve(__dirname, 'packages/auth/src/index.ts'),
      '@arcane/policy': resolve(__dirname, 'packages/policy/src/index.ts'),
      '@arcane/search': resolve(__dirname, 'packages/search/src/index.ts'),
    },
  },
});
