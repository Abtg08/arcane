/**
 * Slack OAuth2 flow helpers.
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
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
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
  bot_user_id?: string;
  team?: { id: string; name: string };
}

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

  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Slack token exchange failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as Record<string, unknown>;

  if (json['ok'] !== true) {
    const err = typeof json['error'] === 'string' ? json['error'] : 'unknown';
    throw new Error(`Slack token exchange error: ${err}`);
  }

  if (typeof json['access_token'] !== 'string' || json['access_token'].length === 0) {
    throw new Error('Slack token exchange: missing access_token');
  }

  return {
    access_token: json['access_token'],
    token_type: typeof json['token_type'] === 'string' ? json['token_type'] : 'bearer',
    scope: typeof json['scope'] === 'string' ? json['scope'] : '',
  };
}

export function validateState(expected: string, actual: string): boolean {
  if (expected.length === 0 || actual.length === 0) return false;
  if (expected.length !== actual.length) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  return timingSafeEqual(a, b);
}
