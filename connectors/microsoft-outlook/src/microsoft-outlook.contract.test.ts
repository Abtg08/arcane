/**
 * Microsoft Outlook connector — contract tests.
 */

import { describe, it, expect } from 'vitest';
import { OUTLOOK_CONNECTOR_DEF, OUTLOOK_TOOLS } from './index.js';
import {
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  startOAuthFlow,
  validateState,
} from './oauth.js';

describe('OUTLOOK_CONNECTOR_DEF', () => {
  it('has required identity fields', () => {
    expect(OUTLOOK_CONNECTOR_DEF.id).toBe('microsoft-outlook');
    expect(OUTLOOK_CONNECTOR_DEF.slug).toBe('microsoft-outlook');
    expect(OUTLOOK_CONNECTOR_DEF.name).toBe('Microsoft Outlook');
    expect(OUTLOOK_CONNECTOR_DEF.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('uses Microsoft Graph base URL', () => {
    expect(OUTLOOK_CONNECTOR_DEF.base_url).toBe('https://graph.microsoft.com/v1.0');
  });

  it('is oauth2 type', () => {
    expect(OUTLOOK_CONNECTOR_DEF.auth.type).toBe('oauth2');
  });

  it('pkce is true (Microsoft supports PKCE)', () => {
    const { auth } = OUTLOOK_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.pkce).toBe(true);
    }
  });

  it('supports token refresh', () => {
    const { auth } = OUTLOOK_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.refresh_supported).toBe(true);
    }
  });

  it('includes offline_access scope for refresh tokens', () => {
    const { auth } = OUTLOOK_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.scopes).toContain('offline_access');
    }
  });

  it('authorization_url targets Microsoft identity platform', () => {
    const { auth } = OUTLOOK_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.authorization_url).toContain('login.microsoftonline.com');
    }
  });

  it('tools array matches OUTLOOK_TOOLS', () => {
    expect(OUTLOOK_CONNECTOR_DEF.tools).toBe(OUTLOOK_TOOLS);
  });
});

describe('OUTLOOK_TOOLS', () => {
  it('has at least 5 tools', () => {
    expect(OUTLOOK_TOOLS.length).toBeGreaterThanOrEqual(5);
  });

  it('all tools have required fields', () => {
    for (const tool of OUTLOOK_TOOLS) {
      expect(typeof tool.slug).toBe('string');
      expect(Array.isArray(tool.risk_level)).toBe(true);
      expect(typeof tool.read_only).toBe('boolean');
      expect(typeof tool.http.method).toBe('string');
      expect(typeof tool.http.path).toBe('string');
    }
  });

  it('slugs are unique', () => {
    const slugs = OUTLOOK_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('no credential parameters', () => {
    const forbidden = /token|secret|password|api_?key|credential/i;
    for (const tool of OUTLOOK_TOOLS) {
      for (const param of tool.parameters) {
        expect(param.name).not.toMatch(forbidden);
      }
    }
  });

  it('all paths begin with /me/', () => {
    for (const tool of OUTLOOK_TOOLS) {
      expect(tool.http.path).toMatch(/^\/me\//);
    }
  });
});

describe('send_message tool', () => {
  const tool = OUTLOOK_TOOLS.find((t) => t.slug === 'send_message');
  it('exists and is not read-only', () => {
    expect(tool).toBeDefined();
    expect(tool!.read_only).toBe(false);
  });
  it('has EXTERNAL_COMMUNICATION risk level', () => {
    expect(tool!.risk_level).toContain('EXTERNAL_COMMUNICATION');
  });
  it('posts to sendMail endpoint', () => {
    expect(tool!.http.method).toBe('POST');
    expect(tool!.http.path).toContain('sendMail');
  });
  it('requires message param', () => {
    const paramNames = tool!.parameters.map((p) => p.name);
    expect(paramNames).toContain('message');
  });
});

describe('create_event tool', () => {
  const tool = OUTLOOK_TOOLS.find((t) => t.slug === 'create_event');
  it('exists and is not read-only', () => {
    expect(tool).toBeDefined();
    expect(tool!.read_only).toBe(false);
  });
  it('is POST to events', () => {
    expect(tool!.http.method).toBe('POST');
    expect(tool!.http.path).toBe('/me/events');
  });
  it('requires subject, start, end params', () => {
    const paramNames = tool!.parameters.map((p) => p.name);
    expect(paramNames).toContain('subject');
    expect(paramNames).toContain('start');
    expect(paramNames).toContain('end');
  });
});

describe('Microsoft Outlook OAuth helpers', () => {
  it('generateCodeVerifier is base64url', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(v.length).toBeGreaterThan(40);
  });

  it('deriveCodeChallenge produces base64url SHA256', () => {
    const verifier = generateCodeVerifier();
    const challenge = deriveCodeChallenge(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge.length).toBeGreaterThan(30);
  });

  it('buildAuthorizationUrl targets Microsoft identity platform', () => {
    const verifier = generateCodeVerifier();
    const challenge = deriveCodeChallenge(verifier);
    const url = new URL(buildAuthorizationUrl({
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['Mail.Read'],
      state: generateState(),
      codeChallenge: challenge,
    }));
    expect(url.hostname).toBe('login.microsoftonline.com');
    expect(url.pathname).toContain('oauth2/v2.0/authorize');
  });

  it('buildAuthorizationUrl includes PKCE params', () => {
    const verifier = generateCodeVerifier();
    const challenge = deriveCodeChallenge(verifier);
    const url = new URL(buildAuthorizationUrl({
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['Mail.Read'],
      state: generateState(),
      codeChallenge: challenge,
    }));
    expect(url.searchParams.get('code_challenge')).toBe(challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('startOAuthFlow returns url, state, codeVerifier', () => {
    const r = startOAuthFlow({
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['Mail.Read'],
    });
    expect(typeof r.url).toBe('string');
    expect(typeof r.state).toBe('string');
    expect(typeof r.codeVerifier).toBe('string');
  });

  it('state in URL matches returned state', () => {
    const r = startOAuthFlow({
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['Mail.Read'],
    });
    const url = new URL(r.url);
    expect(url.searchParams.get('state')).toBe(r.state);
  });

  it('validateState timing-safe', () => {
    const s = generateState();
    expect(validateState(s, s)).toBe(true);
    expect(validateState(s, generateState())).toBe(false);
  });
});
