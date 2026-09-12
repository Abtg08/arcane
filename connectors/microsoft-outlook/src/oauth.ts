/**
 * Microsoft Outlook OAuth2 flow helpers.
 *
 * Microsoft Identity Platform OAuth2:
 * Authorization URL: https://login.microsoftonline.com/common/oauth2/v2.0/authorize
 * Token URL:         https://login.microsoftonline.com/common/oauth2/v2.0/token
 *
 * SI-16: PKCE S256 + atomic state consume.
 * SI-02: Tokens only returned from exchange, never logged.
 * Microsoft supports PKCE — we use it.
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
  const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('response_mode', 'query');
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
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

export interface TokenExchangeResult {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeCodeForToken(
  params: TokenExchangeParams,
): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    code: params.code,
    code_verifier: params.codeVerifier,
    grant_type: 'authorization_code',
  });

  const res = await fetch(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    },
  );

  if (!res.ok) {
    throw new Error(`Microsoft token exchange failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as Record<string, unknown>;

  if (typeof json['access_token'] !== 'string' || json['access_token'].length === 0) {
    throw new Error('Microsoft token exchange: missing access_token');
  }

  return {
    access_token: json['access_token'],
    ...(typeof json['refresh_token'] === 'string' ? { refresh_token: json['refresh_token'] } : {}),
    expires_in: typeof json['expires_in'] === 'number' ? json['expires_in'] : 3600,
    scope: typeof json['scope'] === 'string' ? json['scope'] : '',
    token_type: typeof json['token_type'] === 'string' ? json['token_type'] : 'Bearer',
  };
}

export async function refreshAccessToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    refresh_token: opts.refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    },
  );

  if (!res.ok) {
    throw new Error(`Microsoft token refresh failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as Record<string, unknown>;

  if (typeof json['access_token'] !== 'string' || json['access_token'].length === 0) {
    throw new Error('Microsoft token refresh: missing access_token');
  }

  return {
    access_token: json['access_token'],
    ...(typeof json['refresh_token'] === 'string' ? { refresh_token: json['refresh_token'] } : {}),
    expires_in: typeof json['expires_in'] === 'number' ? json['expires_in'] : 3600,
    scope: typeof json['scope'] === 'string' ? json['scope'] : '',
    token_type: typeof json['token_type'] === 'string' ? json['token_type'] : 'Bearer',
  };
}

export function validateState(expected: string, actual: string): boolean {
  if (expected.length === 0 || actual.length === 0) return false;
  if (expected.length !== actual.length) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  return timingSafeEqual(a, b);
}
