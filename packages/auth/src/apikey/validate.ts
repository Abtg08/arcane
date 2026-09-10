/**
 * API key validation — DB lookup and hash comparison.
 *
 * Validation flow:
 *   1. Extract prefix from incoming key (first 16 chars after arc_{type}_)
 *   2. Lookup candidate rows by prefix (fast indexed scan)
 *   3. Constant-time hash comparison for each candidate
 *   4. Check expiry, revocation
 *
 * SI-15: key_hash is never returned. Plaintext key never logged.
 */

import type { DbPool } from '@arcane/core';
import { UnauthorizedError } from '@arcane/core';
import type { UUIDv7 } from '@arcane/schemas';
import type { ApiKeyPermission } from '@arcane/schemas';
import { compareApiKeyHash } from './generate.js';

export interface ValidatedApiKey {
  id: UUIDv7;
  environment_id: UUIDv7;
  permissions: ApiKeyPermission[];
}

interface ApiKeyRow {
  id: string;
  environment_id: string;
  key_prefix: string;
  key_hash: string;
  permissions: ApiKeyPermission[];
  expires_at: Date | null;
  revoked_at: Date | null;
}

/**
 * Validate an incoming API key against the database.
 * Returns the resolved key metadata or throws UnauthorizedError.
 */
export async function validateApiKey(
  rawKey: string,
  db: DbPool,
): Promise<ValidatedApiKey> {
  // Extract the visible prefix for the indexed lookup
  // Key format: arc_{type}_{64-hex-chars}
  // Prefix stored: arc_{type}_{first-8-chars} = ~14-16 chars
  const prefix = rawKey.slice(0, rawKey.lastIndexOf('_') + 9); // arc_live_ + 8 chars

  if (!prefix || prefix.length < 10) {
    throw new UnauthorizedError('Invalid API key format');
  }

  // Lookup candidates by prefix — typically 1 row, avoids full table scan
  const { rows } = await db.query<ApiKeyRow>(
    `SELECT id, environment_id, key_prefix, key_hash, permissions, expires_at, revoked_at
     FROM api_keys
     WHERE key_prefix = $1
       AND revoked_at IS NULL`,
    [prefix],
  );

  // Constant-time comparison for each candidate (usually just 1)
  const match = rows.find((row) => compareApiKeyHash(rawKey, row.key_hash));

  if (!match) {
    throw new UnauthorizedError('Invalid API key');
  }

  // Check expiry
  if (match.expires_at !== null && match.expires_at < new Date()) {
    throw new UnauthorizedError('API key has expired');
  }

  // Update last_used_at — fire-and-forget (non-critical)
  void db
    .query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [match.id])
    .catch(() => {
      // Non-critical — don't fail the request if this update fails
    });

  return {
    id: match.id as UUIDv7,
    environment_id: match.environment_id as UUIDv7,
    permissions: match.permissions,
  };
}

/**
 * Check if a validated API key has the required permission.
 */
export function hasPermission(
  key: ValidatedApiKey,
  required: ApiKeyPermission,
): boolean {
  if (key.permissions.includes('ADMIN')) return true;
  return key.permissions.includes(required);
}
