/**
 * Base repository — typed query helpers over the connection pool.
 *
 * Repositories are the ONLY layer that touches SQL. Service layer calls
 * repositories; routes call services. No raw SQL in services or routes.
 */

import pg from 'pg';
import { query, withTransaction, getPool } from '../db/pool.js';
import { generateId } from '../db/uuid.js';
import { NotFoundError, DatabaseError } from '../errors/index.js';
import type { UUIDv7 } from '@arcane/schemas';

export type { DbPool, DbClient } from '../db/pool.js';

export interface PaginationArgs {
  limit: number;
  cursor?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  next_cursor: string | null;
  has_more: boolean;
}

/**
 * Generic base repository. Extend per domain entity.
 *
 * T = full entity row shape
 * C = create input shape
 */
export abstract class BaseRepository<T extends { id: UUIDv7 }, C> {
  protected abstract readonly tableName: string;

  protected async findById(id: UUIDv7): Promise<T | null> {
    const result = await query<T>(
      `SELECT * FROM ${this.tableName} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  protected async findByIdOrThrow(id: UUIDv7, resourceName?: string): Promise<T> {
    const row = await this.findById(id);
    if (!row) {
      throw new NotFoundError(resourceName ?? this.tableName, id);
    }
    return row;
  }

  /**
   * Cursor-based pagination using UUIDv7 (time-ordered).
   * cursor is the `id` of the last row from the previous page.
   */
  protected async findPaginated(
    args: PaginationArgs,
    whereClause: string = '',
    params: unknown[] = [],
  ): Promise<PaginatedResult<T>> {
    const { limit, cursor } = args;
    const fetchLimit = limit + 1; // fetch one extra to determine has_more

    let sql = `SELECT * FROM ${this.tableName}`;
    const queryParams: unknown[] = [...params];

    if (whereClause) {
      sql += ` WHERE ${whereClause}`;
    }

    if (cursor) {
      const conjunction = whereClause ? 'AND' : 'WHERE';
      sql += ` ${conjunction} id > $${queryParams.length + 1}`;
      queryParams.push(cursor);
    }

    sql += ` ORDER BY id ASC LIMIT $${queryParams.length + 1}`;
    queryParams.push(fetchLimit);

    const result = await query<T>(sql, queryParams);
    const rows = result.rows;

    const has_more = rows.length > limit;
    const data = has_more ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const next_cursor = has_more && last ? last.id : null;

    return { data, next_cursor, has_more };
  }

  protected async insertOne(data: Record<string, unknown>): Promise<T> {
    const id = generateId();
    const withId = { id, ...data };

    const keys = Object.keys(withId);
    const values = Object.values(withId);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const columns = keys.map((k) => `"${k}"`).join(', ');

    const result = await query<T>(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values,
    );

    const row = result.rows[0];
    if (!row) {
      throw new DatabaseError(`Insert into ${this.tableName} returned no row`);
    }
    return row;
  }

  protected async updateOne(
    id: UUIDv7,
    data: Partial<Record<string, unknown>>,
    client?: pg.PoolClient,
  ): Promise<T | null> {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      return this.findById(id);
    }

    const setClause = entries.map(([k, _], i) => `"${k}" = $${i + 2}`).join(', ');
    const values = [id, ...entries.map(([, v]) => v)];

    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = $1 RETURNING *`;

    const result = client
      ? await client.query<T>(sql, values)
      : await query<T>(sql, values);

    return result.rows[0] ?? null;
  }

  protected async softDelete(
    id: UUIDv7,
    statusField: string = 'status',
    deletedValue: string = 'DELETED',
  ): Promise<void> {
    await query(
      `UPDATE ${this.tableName} SET "${statusField}" = $2 WHERE id = $1`,
      [id, deletedValue],
    );
  }

  protected query = query;
  protected withTransaction = withTransaction;
  protected getPool = getPool;
  protected generateId = generateId;

  // Abstract — subclass implements domain-specific create
  abstract create(data: C): Promise<T>;
}
