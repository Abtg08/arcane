/**
 * Shopify OAuth2 flow helpers.
 *
 * Shopify uses a per-shop OAuth flow:
 * Authorization URL: https://{shop}.myshopify.com/admin/oauth/authorize
 * Token URL:        https://{shop}.myshopify.com/admin/oauth/access_token
 *
 * SI-16: PKCE S256 + atomic state consume.
 * NOTE: Shopify does not support PKCE — uses HMAC validation on the callback instead.
 * We generate state for CSRF protection.
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
  shop: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
}

export interface AuthorizationUrlResult {
  url: string;
  state: string;
  codeVerifier: string;
}

export function buildAuthorizationUrl(params: AuthorizationUrlParams): string {
  const url = new URL(`https://${params.shop}.myshopify.com/admin/oauth/authorize`);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('scope', params.scopes.join(','));
  url.searchParams.set('state', params.state);
  return url.toString();
}

export function startOAuthFlow(opts: {
  shop: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
}): AuthorizationUrlResult {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = buildAuthorizationUrl({
    shop: opts.shop,
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    scopes: opts.scopes,
    state,
  });
  return { url, state, codeVerifier };
}

export interface TokenExchangeParams {
  shop: string;
  clientId: string;
  clientSecret: string;
  code: string;
}

export interface TokenExchangeResult {
  access_token: string;
  scope: string;
}

export async function exchangeCodeForToken(
  params: TokenExchangeParams,
): Promise<TokenExchangeResult> {
  const res = await fetch(`https://${params.shop}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
    }),
  });

  if (!res.ok) {
    throw new Error(`Shopify token exchange failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as Record<string, unknown>;

  if (typeof json['access_token'] !== 'string' || json['access_token'].length === 0) {
    throw new Error('Shopify token exchange: missing access_token');
  }

  return {
    access_token: json['access_token'],
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
