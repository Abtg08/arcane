/**
 * PostgreSQL connection pool — single instance per process.
 *
 * SECURITY: This module never logs query parameters.
 * Secrets NEVER flow through SQL; only opaque secret_reference strings.
 */

import pg from 'pg';
import { DatabaseError } from '../errors/index.js';

const { Pool } = pg;

export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;
export type QueryResult<T extends pg.QueryResultRow = pg.QueryResultRow> = pg.QueryResult<T>;

let _pool: pg.Pool | null = null;

export interface PoolConfig {
  connectionString: string;
  min?: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * Initialize the connection pool. Call once at startup.
 * Throws if already initialized.
 */
export function initPool(config: PoolConfig): pg.Pool {
  if (_pool !== null) {
    throw new DatabaseError('Pool already initialized — call shutdownPool() first');
  }

  _pool = new Pool({
    connectionString: config.connectionString,
    min: config.min ?? 2,
    max: config.max ?? 10,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5_000,
    // Ensure UTC everywhere — never trust client timezone
    options: '-c TimeZone=UTC',
  });

  _pool.on('error', (err) => {
    // Pool-level errors (connection drops, etc.)
    // Logger is not available here to avoid circular deps; caller wires up error handling
    console.error('[db-pool] Unexpected pool error', { code: (err as NodeJS.ErrnoException).code });
  });

  return _pool;
}

/**
 * Get the initialized pool. Throws if initPool() was never called.
 */
export function getPool(): pg.Pool {
  if (_pool === null) {
    throw new DatabaseError('Pool not initialized — call initPool() before getPool()');
  }
  return _pool;
}

/**
 * Execute a query on the pool. Wraps pg errors in DatabaseError.
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const pool = getPool();
  try {
    return await pool.query<T>(sql, params);
  } catch (err) {
    throw new DatabaseError(
      err instanceof Error ? err.message : 'Unknown query error',
      err,
    );
  }
}

/**
 * Execute multiple queries in a single transaction.
 * Automatically rolls back on error.
 */
export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof DatabaseError) {
      throw err;
    }
    throw new DatabaseError(
      err instanceof Error ? err.message : 'Transaction failed',
      err,
    );
  } finally {
    client.release();
  }
}

/**
 * Drain and close all pool connections. Call on graceful shutdown.
 */
export async function shutdownPool(): Promise<void> {
  if (_pool !== null) {
    await _pool.end();
    _pool = null;
  }
}

/**
 * Health check — returns true if the pool can execute a trivial query.
 */
export async function checkDbHealth(): Promise<boolean> {
  try {
    const result = await query<{ ok: number }>('SELECT 1 AS ok');
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}
