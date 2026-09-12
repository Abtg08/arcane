/**
 * Linear connector — contract tests.
 */

import { describe, it, expect } from 'vitest';
import { LINEAR_CONNECTOR_DEF, LINEAR_TOOLS } from './index.js';
import {
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  startOAuthFlow,
  validateState,
} from './oauth.js';

describe('LINEAR_CONNECTOR_DEF', () => {
  it('has required identity fields', () => {
    expect(LINEAR_CONNECTOR_DEF.id).toBe('linear');
    expect(LINEAR_CONNECTOR_DEF.slug).toBe('linear');
    expect(LINEAR_CONNECTOR_DEF.name).toBe('Linear');
    expect(LINEAR_CONNECTOR_DEF.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('uses Linear API base URL', () => {
    expect(LINEAR_CONNECTOR_DEF.base_url).toBe('https://api.linear.app');
  });

  it('has pkce enabled', () => {
    const { auth } = LINEAR_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.pkce).toBe(true);
    }
  });

  it('tools array matches LINEAR_TOOLS', () => {
    expect(LINEAR_CONNECTOR_DEF.tools).toBe(LINEAR_TOOLS);
  });
});

describe('LINEAR_TOOLS', () => {
  it('has at least 5 tools', () => {
    expect(LINEAR_TOOLS.length).toBeGreaterThanOrEqual(5);
  });

  it('all tools use GraphQL endpoint', () => {
    for (const tool of LINEAR_TOOLS) {
      expect(tool.http.path).toBe('/graphql');
      expect(tool.http.method).toBe('POST');
    }
  });

  it('all tools have required fields', () => {
    for (const tool of LINEAR_TOOLS) {
      expect(typeof tool.slug).toBe('string');
      expect(Array.isArray(tool.risk_level)).toBe(true);
      expect(typeof tool.read_only).toBe('boolean');
    }
  });

  it('slugs are unique', () => {
    const slugs = LINEAR_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('no credential parameters', () => {
    const forbidden = /token|secret|password|api_?key|credential/i;
    for (const tool of LINEAR_TOOLS) {
      for (const param of tool.parameters) {
        expect(param.name).not.toMatch(forbidden);
      }
    }
  });

  it('all tools accept query parameter', () => {
    for (const tool of LINEAR_TOOLS) {
      const paramNames = tool.parameters.map((p) => p.name);
      expect(paramNames).toContain('query');
    }
  });
});

describe('create_issue tool', () => {
  const tool = LINEAR_TOOLS.find((t) => t.slug === 'create_issue');
  it('exists', () => expect(tool).toBeDefined());
  it('is WRITE risk', () => expect(tool!.risk_level).toContain('WRITE'));
  it('is not read-only', () => expect(tool!.read_only).toBe(false));
});

describe('list_issues tool', () => {
  const tool = LINEAR_TOOLS.find((t) => t.slug === 'list_issues');
  it('exists and is read-only', () => {
    expect(tool).toBeDefined();
    expect(tool!.read_only).toBe(true);
  });
});

describe('Linear OAuth helpers', () => {
  it('generateCodeVerifier is 64 chars', () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('buildAuthorizationUrl targets linear.app', () => {
    const url = new URL(buildAuthorizationUrl({
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['read', 'write'],
      state: generateState(),
      codeChallenge: deriveCodeChallenge(generateCodeVerifier()),
    }));
    expect(url.hostname).toBe('linear.app');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('startOAuthFlow codeVerifier matches challenge', () => {
    const r = startOAuthFlow({ clientId: 'c', redirectUri: 'https://arcane.dev/cb', scopes: ['read'] });
    const url = new URL(r.url);
    expect(url.searchParams.get('code_challenge')).toBe(deriveCodeChallenge(r.codeVerifier));
  });

  it('validateState', () => {
    const s = generateState();
    expect(validateState(s, s)).toBe(true);
    expect(validateState(s, generateState())).toBe(false);
    expect(validateState('', s)).toBe(false);
  });
});
