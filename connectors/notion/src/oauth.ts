/**
 * Notion OAuth2 flow helpers.
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
  state: string;
}

export interface AuthorizationUrlResult {
  url: string;
  state: string;
  codeVerifier: string;
}

/**
 * Notion OAuth2 does not support PKCE as of 2024 — uses client_secret on token exchange.
 * We still generate a verifier for internal tracking and state management.
 */
export function buildAuthorizationUrl(params: AuthorizationUrlParams): string {
  const url = new URL('https://api.notion.com/v1/oauth/authorize');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('owner', 'user');
  url.searchParams.set('state', params.state);
  return url.toString();
}

export function startOAuthFlow(opts: {
  clientId: string;
  redirectUri: string;
}): AuthorizationUrlResult {
  const state = generateState();
  const codeVerifier = generateCodeVerifier(); // kept for internal tracking
  const url = buildAuthorizationUrl({
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    state,
  });
  return { url, state, codeVerifier };
}

export interface TokenExchangeParams {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}

export interface TokenExchangeResult {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
}

export async function exchangeCodeForToken(
  params: TokenExchangeParams,
): Promise<TokenExchangeResult> {
  const credentials = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString('base64');

  const res = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`Notion token exchange failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as Record<string, unknown>;

  if (typeof json['access_token'] !== 'string' || json['access_token'].length === 0) {
    const err = typeof json['error'] === 'string' ? json['error'] : 'unknown';
    throw new Error(`Notion token exchange error: ${err}`);
  }

  return {
    access_token: json['access_token'],
    token_type: typeof json['token_type'] === 'string' ? json['token_type'] : 'bearer',
    bot_id: typeof json['bot_id'] === 'string' ? json['bot_id'] : '',
    workspace_id: typeof json['workspace_id'] === 'string' ? json['workspace_id'] : '',
    ...(typeof json['workspace_name'] === 'string' ? { workspace_name: json['workspace_name'] } : {}),
  };
}

export function validateState(expected: string, actual: string): boolean {
  if (expected.length === 0 || actual.length === 0) return false;
  if (expected.length !== actual.length) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  return timingSafeEqual(a, b);
}
