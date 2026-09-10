/**
 * JWT issuance and verification for Arcane sessions.
 *
 * JWTs are short-lived tokens issued to end-users (via SDK/MCP sessions).
 * They encode session_id + environment_id — no credentials, no secrets.
 *
 * Payload shape is intentionally minimal — all session metadata lives in DB.
 * The JWT is just a bearer token that proves "I have session X".
 */

import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '@arcane/core';
import type { UUIDv7 } from '@arcane/schemas';

export interface SessionTokenPayload {
  /** Session UUID — primary lookup key */
  sub: UUIDv7;
  /** Environment the session belongs to */
  env: UUIDv7;
  /** Standard JWT issued-at (seconds since epoch) */
  iat: number;
  /** Standard JWT expiry (seconds since epoch) */
  exp: number;
  /** Arcane issuer marker */
  iss: 'arcane';
}

export interface IssueTokenOptions {
  sessionId: UUIDv7;
  environmentId: UUIDv7;
  secret: string;
  expiresIn: string | number; // e.g. "24h", 3600
}

/**
 * Issue a signed JWT for a session.
 * NEVER include credentials, key_hash, or secret_reference in the payload.
 */
export function issueSessionToken(opts: IssueTokenOptions): string {
  const payload = {
    sub: opts.sessionId,
    env: opts.environmentId,
    iss: 'arcane' as const,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, opts.secret, {
    expiresIn: opts.expiresIn as any,
    algorithm: 'HS256',
  });
}

/**
 * Verify and decode a session JWT.
 * Throws UnauthorizedError for any invalid/expired token.
 */
export function verifySessionToken(
  token: string,
  secret: string,
): SessionTokenPayload {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'arcane',
    });

    if (typeof decoded === 'string' || !decoded.sub) {
      throw new UnauthorizedError('Malformed session token');
    }

    return decoded as SessionTokenPayload;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;

    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Session token has expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid session token');
    }

    throw new UnauthorizedError('Session token verification failed');
  }
}

/**
 * Decode a JWT without verification — for logging/debugging only.
 * NEVER use this for authorization.
 */
export function decodeTokenUnsafe(
  token: string,
): Partial<SessionTokenPayload> | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === 'string') return null;
  return decoded as Partial<SessionTokenPayload>;
}
