/**
 * Linear OAuth2 flow helpers.
 * SI-16: PKCE S256 + atomic state consume.
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export function generateCodeVerifier(): string {
  return randomBytes(48).toString('base64url');
}

export function deriveCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export function generateState(): string {
  return randomBytes(32).toString('base64url');
}

export interface AuthorizationUrlParams {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
}

export interface AuthorizationUrlResult {
  url: string;
  state: string;
  codeVerifier: string;
}

export function buildAuthorizationUrl(params: AuthorizationUrlParams): string {
  const url = new URL('https://linear.app/oauth/authorize');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scopes.join(','));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

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
  expires_in?: number;
}

export async function exchangeCodeForToken(
  params: TokenExchangeParams,
): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });

  const res = await fetch('https://api.linear.app/oauth/token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Linear token exchange failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as Record<string, unknown>;

  if (typeof json['access_token'] !== 'string' || json['access_token'].length === 0) {
    const err = typeof json['error'] === 'string' ? json['error'] : 'unknown';
    throw new Error(`Linear token exchange error: ${err}`);
  }

  return {
    access_token: json['access_token'],
    token_type: typeof json['token_type'] === 'string' ? json['token_type'] : 'Bearer',
    scope: typeof json['scope'] === 'string' ? json['scope'] : '',
    ...(typeof json['expires_in'] === 'number' ? { expires_in: json['expires_in'] } : {}),
  };
}

export function validateState(expected: string, actual: string): boolean {
  if (expected.length === 0 || actual.length === 0) return false;
  if (expected.length !== actual.length) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  return timingSafeEqual(a, b);
}
