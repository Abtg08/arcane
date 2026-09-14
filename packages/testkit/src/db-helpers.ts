/**
 * Database helpers for integration tests.
 *
 * Wraps each test in a transaction that rolls back after — fast, no teardown needed.
 */

import { initPool, withTransaction, shutdownPool } from '@arcane/core';
import type { DbClient } from '@arcane/core';

const TEST_DB_URL = process.env['DATABASE_URL'] ?? 'postgresql://arcane:arcane@localhost:5432/arcane_test';

let _initialized = false;

export function setupTestDb(): void {
  if (!_initialized) {
    initPool({ connectionString: TEST_DB_URL });
    _initialized = true;
  }
}

export async function teardownTestDb(): Promise<void> {
  await shutdownPool();
  _initialized = false;
}

/**
 * Run a test inside a rolled-back transaction.
 * No cleanup needed — the transaction is rolled back after fn() returns.
 */
export async function withRollback<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  return withTransaction(async (client) => {
    const result = await fn(client);
    // Force rollback by throwing after successful fn execution
    // We capture the result first, then re-throw a sentinel
    throw { __rollback: true, result };
  }).catch((err: unknown) => {
    if (err && typeof err === 'object' && '__rollback' in err) {
      return (err as unknown as { result: T }).result;
    }
    throw err;
  });
}

/**
 * Truncate test data between test suites (slower than withRollback, use sparingly).
 */
export async function truncateTables(tables: string[]): Promise<void> {
  await withTransaction(async (client) => {
    for (const table of tables) {
      await client.query(`TRUNCATE TABLE ${table} CASCADE`);
    }
  });
}
