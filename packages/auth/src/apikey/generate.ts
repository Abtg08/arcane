/**
 * API key generation.
 *
 * Keys are structured: {prefix}{type}_{random}
 * Example: arc_live_a1b2c3d4e5f6...
 *
 * SI-15: Plaintext is returned ONCE at creation. Only sha256(key) is stored.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export interface GeneratedApiKey {
  /** Full key — shown ONCE, never stored. */
  plaintext: string;
  /** sha256(plaintext) — stored in DB. */
  hash: string;
  /** First 8 chars of the random portion — stored for display/lookup. */
  prefix: string;
}

/**
 * Generate a new API key.
 * @param keyPrefix - Platform prefix from config (default "arc_")
 * @param type - Key type ("live" | "test")
 */
export function generateApiKey(
  keyPrefix: string = 'arc_',
  type: 'live' | 'test' = 'live',
): GeneratedApiKey {
  // 32 bytes = 64 hex chars of entropy
  const secret = randomBytes(32).toString('hex');
  const plaintext = `${keyPrefix}${type}_${secret}`;
  const hash = hashApiKey(plaintext);
  const prefix = `${keyPrefix}${type}_${secret.slice(0, 8)}`;

  return { plaintext, hash, prefix };
}

/**
 * Hash an API key for storage/comparison.
 * Uses SHA-256 — fast, constant-time via Node crypto, sufficient for
 * high-entropy random keys (not a password — no salt needed).
 */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Constant-time comparison for API key hashes.
 * Prevents timing attacks on hash comparison.
 */
export function compareApiKeyHash(plaintext: string, storedHash: string): boolean {
  const candidateHash = hashApiKey(plaintext);
  // Both are fixed-length hex strings — timingSafeEqual requires Buffers of same length
  if (candidateHash.length !== storedHash.length) return false;

  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(storedHash, 'hex');

  return timingSafeEqual(a, b);
}
