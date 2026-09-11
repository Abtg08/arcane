/**
 * Policy repository — loads active policies from the database.
 *
 * Policies are loaded fresh per execution (no caching in Phase 2).
 * Phase 3 can add a short TTL cache backed by Valkey.
 */

import type { DbPool } from '@arcane/core';
import { PolicyRulesSchema, type Policy } from '@arcane/schemas';

export interface PolicyRow {
  id: string;
  name: string;
  rules: unknown;
  version: number;
}

/**
 * Load all ACTIVE policies for an environment, ordered by creation (oldest first).
 * Rules are validated with Zod — a corrupt policy row is skipped with a warning.
 */
export async function loadActivePolicies(
  db: DbPool,
  environmentId: string,
): Promise<Policy[]> {
  const { rows } = await db.query<{
    id: string;
    environment_id: string;
    name: string;
    description: string | null;
    version: number;
    status: string;
    rules: unknown;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT id, environment_id, name, description, version, status, rules, created_at, updated_at
     FROM policies
     WHERE environment_id = $1 AND status = 'ACTIVE'
     ORDER BY created_at ASC`,
    [environmentId],
  );

  const policies: Policy[] = [];

  for (const row of rows) {
    const rulesResult = PolicyRulesSchema.safeParse(row.rules);
    if (!rulesResult.success) {
      // Log and skip — a corrupt policy must not block execution
      console.warn(
        `[policy] Skipping policy '${row.id}' — invalid rules schema:`,
        rulesResult.error.flatten(),
      );
      continue;
    }

    policies.push({
      id: row.id as Policy['id'],
      environment_id: row.environment_id as Policy['environment_id'],
      name: row.name,
      description: row.description,
      version: row.version,
      status: row.status as Policy['status'],
      rules: rulesResult.data,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    });
  }

  return policies;
}
