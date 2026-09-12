/**
 * Gmail connector — contract tests.
 */

import { describe, it, expect } from 'vitest';
import { GMAIL_CONNECTOR_DEF, GMAIL_TOOLS } from './index.js';
import {
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  startOAuthFlow,
  validateState,
} from './oauth.js';

describe('GMAIL_CONNECTOR_DEF', () => {
  it('has required identity fields', () => {
    expect(GMAIL_CONNECTOR_DEF.id).toBe('gmail');
    expect(GMAIL_CONNECTOR_DEF.slug).toBe('gmail');
    expect(GMAIL_CONNECTOR_DEF.name).toBe('Gmail');
    expect(GMAIL_CONNECTOR_DEF.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('uses Google Gmail base URL', () => {
    expect(GMAIL_CONNECTOR_DEF.base_url).toBe('https://gmail.googleapis.com');
  });

  it('has oauth2 auth type with pkce', () => {
    const { auth } = GMAIL_CONNECTOR_DEF;
    expect(auth.type).toBe('oauth2');
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.pkce).toBe(true);
      expect(auth.oauth2.refresh_supported).toBe(true);
    }
  });

  it('scopes include Gmail permissions', () => {
    const { auth } = GMAIL_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      const scopeStr = auth.oauth2.scopes.join(' ');
      expect(scopeStr).toContain('gmail');
    }
  });

  it('tools array matches GMAIL_TOOLS', () => {
    expect(GMAIL_CONNECTOR_DEF.tools).toBe(GMAIL_TOOLS);
  });
});

describe('GMAIL_TOOLS', () => {
  it('has at least 5 tools', () => {
    expect(GMAIL_TOOLS.length).toBeGreaterThanOrEqual(5);
  });

  it('all tools have required fields', () => {
    for (const tool of GMAIL_TOOLS) {
      expect(typeof tool.slug).toBe('string');
      expect(typeof tool.name).toBe('string');
      expect(Array.isArray(tool.risk_level)).toBe(true);
      expect(typeof tool.read_only).toBe('boolean');
      expect(typeof tool.http.method).toBe('string');
      expect(typeof tool.http.path).toBe('string');
    }
  });

  it('slugs are unique', () => {
    const slugs = GMAIL_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('no credential parameters', () => {
    const forbidden = /token|secret|password|api_?key|credential/i;
    for (const tool of GMAIL_TOOLS) {
      for (const param of tool.parameters) {
        expect(param.name).not.toMatch(forbidden);
      }
    }
  });
});

describe('send_message tool', () => {
  const tool = GMAIL_TOOLS.find((t) => t.slug === 'send_message');

  it('exists', () => expect(tool).toBeDefined());
  it('is POST to Gmail send endpoint', () => {
    expect(tool!.http.method).toBe('POST');
    expect(tool!.http.path).toContain('send');
  });
  it('has EXTERNAL_COMMUNICATION risk', () => {
    expect(tool!.risk_level).toContain('EXTERNAL_COMMUNICATION');
  });
  it('has body_schema with raw field', () => {
    expect(tool!.http.body_schema).toBeDefined();
    expect(tool!.http.body_schema?.properties).toHaveProperty('raw');
  });
});

describe('list_messages tool', () => {
  const tool = GMAIL_TOOLS.find((t) => t.slug === 'list_messages');
  it('exists and is read-only', () => {
    expect(tool).toBeDefined();
    expect(tool!.read_only).toBe(true);
  });
  it('supports Gmail search query param', () => {
    const paramNames = tool!.parameters.map((p) => p.name);
    expect(paramNames).toContain('q');
  });
});

describe('Gmail OAuth helpers', () => {
  it('generateCodeVerifier returns 64 base64url chars', () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('buildAuthorizationUrl uses Google accounts domain', () => {
    const url = new URL(buildAuthorizationUrl({
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      state: generateState(),
      codeChallenge: deriveCodeChallenge(generateCodeVerifier()),
    }));
    expect(url.hostname).toBe('accounts.google.com');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('startOAuthFlow returns all 3 fields', () => {
    const r = startOAuthFlow({ clientId: 'c', redirectUri: 'https://arcane.dev/cb', scopes: ['openid'] });
    expect(typeof r.url).toBe('string');
    expect(typeof r.state).toBe('string');
    expect(typeof r.codeVerifier).toBe('string');
  });

  it('validateState timing-safe comparison', () => {
    const s = generateState();
    expect(validateState(s, s)).toBe(true);
    expect(validateState(s, generateState())).toBe(false);
    expect(validateState('', s)).toBe(false);
  });
});
