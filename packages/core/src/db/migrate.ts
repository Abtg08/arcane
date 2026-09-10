/**
 * Minimal migration runner.
 *
 * Reads SQL files from the migrations/ directory in lexicographic order
 * and applies them inside a transaction. Already-applied migrations are
 * tracked in the `schema_migrations` table.
 *
 * Usage: `pnpm db:migrate` (runs node --import tsx packages/core/src/db/migrate.ts)
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const MIGRATIONS_DIR = resolve(process.cwd(), 'migrations');

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client: pg.PoolClient): Promise<Set<string>> {
  const result = await client.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );
  return new Set(result.rows.map((r) => r.version));
}

async function applyMigration(
  client: pg.PoolClient,
  version: string,
  sql: string,
): Promise<void> {
  console.log(`[migrate] Applying ${version}...`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1)',
      [version],
    );
    await client.query('COMMIT');
    console.log(`[migrate] ✓ ${version}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort(); // lexicographic = numeric order since files are prefixed 001_, 002_, etc.

    let applied_count = 0;
    for (const file of files) {
      const version = file.replace('.sql', '');
      if (applied.has(version)) {
        continue;
      }

      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
      await applyMigration(client, version, sql);
      applied_count++;
    }

    if (applied_count === 0) {
      console.log('[migrate] No new migrations to apply.');
    } else {
      console.log(`[migrate] Applied ${applied_count} migration(s).`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

// Run when called directly
if (process.argv[1] === import.meta.filename) {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    console.error('[migrate] DATABASE_URL environment variable is required');
    process.exit(1);
  }

  runMigrations(connectionString).catch((err) => {
    console.error('[migrate] Migration failed:', err);
    process.exit(1);
  });
}
