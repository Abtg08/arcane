/**
 * GitHub OAuth2 flow helpers.
 *
 * SI-16: PKCE S256 + atomic state consume.
 * State is an opaque, cryptographically random token — never store user data in it.
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

// ── PKCE ─────────────────────────────────────────────────────────────────────

/**
 * Generate a PKCE code_verifier (43–128 URL-safe chars per RFC 7636 §4.1).
 * We use 48 random bytes → 64 base64url chars.
 */
export function generateCodeVerifier(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * Derive code_challenge from code_verifier using S256 method.
 * code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
 */
export function deriveCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

// ── State token ───────────────────────────────────────────────────────────────

/**
 * Generate an opaque state token for CSRF protection.
 * 32 random bytes → 43 base64url chars.
 */
export function generateState(): string {
  return randomBytes(32).toString('base64url');
}

// ── Authorization URL ─────────────────────────────────────────────────────────

export interface AuthorizationUrlParams {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
}

export interface AuthorizationUrlResult {
  url: string;
  /** Echo back for storage — caller must persist and consume atomically (SI-16) */
  state: string;
  codeVerifier: string;
}

/**
 * Build a GitHub OAuth2 authorization URL with PKCE.
 *
 * Caller is responsible for:
 *   1. Persisting `state` and `codeVerifier` before redirecting (atomically)
 *   2. Validating the returned `state` matches exactly once on callback (SI-16)
 */
export function buildAuthorizationUrl(params: AuthorizationUrlParams): string {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/**
 * Convenience wrapper — generates state + PKCE and builds the full URL.
 */
export function startOAuthFlow(opts: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}): AuthorizationUrlResult {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const url = buildAuthorizationUrl({
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    scopes: opts.scopes,
    state,
    codeChallenge,
  });
  return { url, state, codeVerifier };
}

// ── Token exchange ────────────────────────────────────────────────────────────

export interface TokenExchangeParams {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

export interface TokenExchangeResult {
  access_token: string;
  token_type: string;
  scope: string;
}

/**
 * Exchange authorization code for access token.
 *
 * NOTE: GitHub does not issue refresh tokens for OAuth Apps.
 * Throws on any non-200 response or missing access_token.
 *
 * SI-02: Caller (connector-runtime) stores the token via SecretManager —
 * this function only returns it, never logs it.
 */
export async function exchangeCodeForToken(
  params: TokenExchangeParams,
): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    // Do not include body — may contain client_secret echo or error_description
    throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as Record<string, unknown>;

  if (typeof json['access_token'] !== 'string' || json['access_token'].length === 0) {
    // GitHub returns 200 with error field on OAuth errors
    const errorDesc = typeof json['error_description'] === 'string'
      ? json['error_description']
      : typeof json['error'] === 'string'
      ? json['error']
      : 'unknown';
    throw new Error(`GitHub token exchange error: ${errorDesc}`);
  }

  return {
    access_token: json['access_token'],
    token_type: typeof json['token_type'] === 'string' ? json['token_type'] : 'bearer',
    scope: typeof json['scope'] === 'string' ? json['scope'] : '',
  };
}

// ── State validation ──────────────────────────────────────────────────────────

/**
 * Constant-time string comparison for state validation.
 * Prevents timing attacks when comparing state tokens (SI-16).
 */
export function validateState(expected: string, actual: string): boolean {
  if (expected.length === 0 || actual.length === 0) return false;
  if (expected.length !== actual.length) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  // timingSafeEqual throws if lengths differ — we guard above
  return timingSafeEqual(a, b);
}
