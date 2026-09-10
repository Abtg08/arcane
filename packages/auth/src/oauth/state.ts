/**
 * OAuth state management (PKCE + CSRF protection).
 *
 * SI-16: OAuth PKCE enforced where provider supports it.
 *        State tokens expire after 10 minutes (Valkey TTL).
 *        CSRF requires exact state match on callback.
 *
 * State is stored in Valkey — ephemeral, not authoritative.
 * If Valkey restarts, in-flight OAuth flows are invalidated gracefully.
 */

import { randomBytes, createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { UnauthorizedError, ValidationError } from '@arcane/core';
import type { UUIDv7 } from '@arcane/schemas';

const STATE_TTL_SECONDS = 600; // 10 minutes — SI-16
const STATE_KEY_PREFIX = 'oauth:state:';

export interface OAuthStateData {
  /** The environment initiating the OAuth flow */
  environment_id: UUIDv7;
  /** The connected account being created/refreshed */
  connection_id: UUIDv7;
  /** The connector slug (e.g. "github") */
  connector_slug: string;
  /** PKCE code verifier — stored server-side, never sent to provider */
  code_verifier: string;
  /** Redirect URL after successful OAuth */
  redirect_uri: string;
  /** Timestamp — for additional TTL validation */
  created_at: number;
}

/** PKCE code challenge methods */
export type CodeChallengeMethod = 'S256' | 'plain';

export interface PkceChallenge {
  code_verifier: string;
  code_challenge: string;
  code_challenge_method: CodeChallengeMethod;
}

/**
 * Generate a PKCE code verifier + challenge pair.
 * Uses S256 (SHA-256) method — plain is only a fallback for broken providers.
 */
export function generatePkceChallenge(method: CodeChallengeMethod = 'S256'): PkceChallenge {
  // RFC 7636: code_verifier is 43-128 chars of unreserved characters
  const code_verifier = randomBytes(32)
    .toString('base64url')
    .slice(0, 64);

  let code_challenge: string;
  if (method === 'S256') {
    code_challenge = createHash('sha256')
      .update(code_verifier)
      .digest('base64url');
  } else {
    code_challenge = code_verifier;
  }

  return { code_verifier, code_challenge, code_challenge_method: method };
}

/**
 * Generate an opaque state token and store the associated OAuth state in Valkey.
 * Returns the state token to embed in the OAuth redirect URL.
 */
export async function createOAuthState(
  redis: Redis,
  data: OAuthStateData,
): Promise<string> {
  const stateToken = randomBytes(32).toString('hex');
  const key = `${STATE_KEY_PREFIX}${stateToken}`;

  await redis.set(key, JSON.stringify(data), 'EX', STATE_TTL_SECONDS);

  return stateToken;
}

/**
 * Retrieve and consume an OAuth state token.
 * Deletes the state after reading — one-time use (CSRF protection).
 * Throws UnauthorizedError if the state is missing/expired.
 */
export async function consumeOAuthState(
  redis: Redis,
  stateToken: string,
): Promise<OAuthStateData> {
  if (!stateToken || stateToken.length !== 64) {
    throw new UnauthorizedError('Invalid OAuth state token format');
  }

  const key = `${STATE_KEY_PREFIX}${stateToken}`;

  // Atomic GET + DEL via pipeline — prevents replay attacks
  const [data] = await redis.pipeline().get(key).del(key).exec() as [[null | Error, string | null], [null | Error, number]];

  if (!data[1]) {
    throw new UnauthorizedError('OAuth state token expired or already used');
  }

  let parsed: OAuthStateData;
  try {
    parsed = JSON.parse(data[1]) as OAuthStateData;
  } catch {
    throw new ValidationError('Corrupted OAuth state data');
  }

  // Secondary TTL check — belt-and-suspenders
  const ageMs = Date.now() - parsed.created_at;
  if (ageMs > STATE_TTL_SECONDS * 1000) {
    throw new UnauthorizedError('OAuth state token has expired');
  }

  return parsed;
}

/**
 * Verify a PKCE code challenge against the stored verifier.
 * Called at token exchange to confirm the callback is from the original requester.
 */
export function verifyPkceChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: CodeChallengeMethod,
): boolean {
  let expected: string;
  if (method === 'S256') {
    expected = createHash('sha256').update(codeVerifier).digest('base64url');
  } else {
    expected = codeVerifier;
  }

  // Constant-length comparison
  return expected === codeChallenge;
}
