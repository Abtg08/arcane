/**
 * Session validation — checks the session is ACTIVE and not expired.
 *
 * SI-17: Sessions are short-lived. Max 24 hours.
 *        Expired sessions rejected at middleware before route handlers.
 *
 * Session lookup is cached in Valkey to avoid DB round-trips on every request.
 * Cache TTL is short (30s) — ensures revocations propagate quickly.
 */

import type { DbPool } from '@arcane/core';
import { UnauthorizedError } from '@arcane/core';
import type { Redis } from 'ioredis';
import type { UUIDv7 } from '@arcane/schemas';
import type { Session } from '@arcane/schemas';

const SESSION_CACHE_TTL = 30; // 30 seconds — balance freshness vs DB load
const SESSION_CACHE_PREFIX = 'session:';

interface SessionRow {
  id: string;
  environment_id: string;
  external_user_id: string;
  status: string;
  expires_at: Date;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/**
 * Validate a session by ID — DB-backed with Valkey cache.
 * Throws UnauthorizedError if session is invalid, expired, or revoked.
 */
export async function validateSession(
  sessionId: UUIDv7,
  db: DbPool,
  redis: Redis,
): Promise<Session> {
  // Try cache first
  const cacheKey = `${SESSION_CACHE_PREFIX}${sessionId}`;
  const cached = await redis.get(cacheKey).catch(() => null);

  if (cached) {
    const session = JSON.parse(cached) as Session;
    // Re-check expiry from cached data (timestamps serialized as strings)
    const expiresAt = new Date(session.expires_at as unknown as string);
    if (expiresAt < new Date()) {
      void redis.del(cacheKey).catch(() => null);
      throw new UnauthorizedError('Session has expired');
    }
    if (session.status !== 'ACTIVE') {
      throw new UnauthorizedError('Session is not active');
    }
    return session;
  }

  // Cache miss — query DB
  const { rows } = await db.query<SessionRow>(
    `SELECT id, environment_id, external_user_id, status, expires_at, metadata, created_at, updated_at
     FROM sessions
     WHERE id = $1`,
    [sessionId],
  );

  const row = rows[0];
  if (!row) {
    throw new UnauthorizedError('Session not found');
  }

  if (row.status !== 'ACTIVE') {
    throw new UnauthorizedError('Session is not active');
  }

  if (row.expires_at < new Date()) {
    throw new UnauthorizedError('Session has expired');
  }

  const session: Session = {
    id: row.id as UUIDv7,
    environment_id: row.environment_id as UUIDv7,
    external_user_id: row.external_user_id as UUIDv7,
    status: 'ACTIVE',
    expires_at: row.expires_at.toISOString(),
    metadata: row.metadata,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };

  // Cache result — short TTL so revocations propagate within 30s
  void redis
    .set(cacheKey, JSON.stringify(session), 'EX', SESSION_CACHE_TTL)
    .catch(() => null);

  return session;
}

/**
 * Invalidate the Valkey cache entry for a session.
 * Call on session revocation to ensure immediate enforcement.
 */
export async function invalidateSessionCache(
  sessionId: UUIDv7,
  redis: Redis,
): Promise<void> {
  await redis.del(`${SESSION_CACHE_PREFIX}${sessionId}`).catch(() => null);
}
