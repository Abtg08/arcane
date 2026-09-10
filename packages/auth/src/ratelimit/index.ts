/**
 * Valkey-backed per-key rate limiting.
 *
 * Uses a sliding window counter (token bucket via INCR + EXPIRE).
 * Valkey is never authoritative (SI-14) — if Valkey is unavailable,
 * we fail open (rate limiting degrades, service continues).
 *
 * Two limit tiers:
 *  - Global RPM: per IP or per environment (covers anonymous/unauthenticated)
 *  - Per-key RPM: per API key (more granular, lower limit)
 */

import type { Redis } from 'ioredis';
import { RateLimitError } from '@arcane/core';

export interface RateLimitConfig {
  /** Limit in requests per window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterMs: number | undefined;
}

const DEFAULT_WINDOW_SECONDS = 60; // 1 minute

/**
 * Check and increment a rate limit counter.
 * Returns the result — caller decides whether to throw or pass through.
 *
 * Key format: ratelimit:{scope}:{identifier}:{window_bucket}
 * Window bucket = Math.floor(now / windowMs) — aligns windows to clock
 */
export async function checkRateLimit(
  redis: Redis,
  identifier: string,
  scope: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const windowMs = (config.windowSeconds ?? DEFAULT_WINDOW_SECONDS) * 1000;
  const windowBucket = Math.floor(Date.now() / windowMs);
  const key = `ratelimit:${scope}:${identifier}:${windowBucket}`;
  const resetAt = new Date((windowBucket + 1) * windowMs);

  try {
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, config.windowSeconds + 1); // +1 to avoid race on TTL boundary
    const [[, count]] = (await pipeline.exec()) as [[null | Error, number], [null | Error, number]];

    const current = count ?? 1;
    const remaining = Math.max(0, config.limit - current);
    const allowed = current <= config.limit;

    return {
      allowed,
      remaining,
      resetAt,
      retryAfterMs: allowed ? undefined : resetAt.getTime() - Date.now(),
    };
  } catch {
    // SI-14: Valkey is never authoritative — fail open on error
    return {
      allowed: true,
      remaining: config.limit,
      resetAt,
      retryAfterMs: undefined,
    };
  }
}

/**
 * Assert rate limit — throws RateLimitError if exceeded.
 * Convenience wrapper over checkRateLimit for route middleware.
 */
export async function assertRateLimit(
  redis: Redis,
  identifier: string,
  scope: string,
  config: RateLimitConfig,
): Promise<void> {
  const result = await checkRateLimit(redis, identifier, scope, config);
  if (!result.allowed) {
    throw new RateLimitError(
      `Rate limit exceeded for ${scope}. Retry after ${Math.ceil((result.retryAfterMs ?? 0) / 1000)}s.`,
      result.retryAfterMs,
    );
  }
}

/**
 * Reset a rate limit counter (for testing or admin override).
 */
export async function resetRateLimit(
  redis: Redis,
  identifier: string,
  scope: string,
  windowSeconds: number = DEFAULT_WINDOW_SECONDS,
): Promise<void> {
  const windowMs = windowSeconds * 1000;
  const windowBucket = Math.floor(Date.now() / windowMs);
  const key = `ratelimit:${scope}:${identifier}:${windowBucket}`;
  await redis.del(key);
}
