/**
 * HubSpot connector — contract tests.
 */

import { describe, it, expect } from 'vitest';
import { HUBSPOT_CONNECTOR_DEF, HUBSPOT_TOOLS } from './index.js';
import {
  generateCodeVerifier,
  generateState,
  buildAuthorizationUrl,
  startOAuthFlow,
  validateState,
} from './oauth.js';

describe('HUBSPOT_CONNECTOR_DEF', () => {
  it('has required identity fields', () => {
    expect(HUBSPOT_CONNECTOR_DEF.id).toBe('hubspot');
    expect(HUBSPOT_CONNECTOR_DEF.slug).toBe('hubspot');
    expect(HUBSPOT_CONNECTOR_DEF.name).toBe('HubSpot');
    expect(HUBSPOT_CONNECTOR_DEF.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('uses HubSpot API base URL', () => {
    expect(HUBSPOT_CONNECTOR_DEF.base_url).toBe('https://api.hubapi.com');
  });

  it('is oauth2 type', () => {
    expect(HUBSPOT_CONNECTOR_DEF.auth.type).toBe('oauth2');
  });

  it('pkce is false (HubSpot does not support PKCE)', () => {
    const { auth } = HUBSPOT_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.pkce).toBe(false);
    }
  });

  it('supports token refresh', () => {
    const { auth } = HUBSPOT_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.refresh_supported).toBe(true);
    }
  });

  it('tools array matches HUBSPOT_TOOLS', () => {
    expect(HUBSPOT_CONNECTOR_DEF.tools).toBe(HUBSPOT_TOOLS);
  });
});

describe('HUBSPOT_TOOLS', () => {
  it('has at least 5 tools', () => {
    expect(HUBSPOT_TOOLS.length).toBeGreaterThanOrEqual(5);
  });

  it('all tools have required fields', () => {
    for (const tool of HUBSPOT_TOOLS) {
      expect(typeof tool.slug).toBe('string');
      expect(Array.isArray(tool.risk_level)).toBe(true);
      expect(typeof tool.read_only).toBe('boolean');
      expect(typeof tool.http.method).toBe('string');
      expect(typeof tool.http.path).toBe('string');
    }
  });

  it('slugs are unique', () => {
    const slugs = HUBSPOT_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('no credential parameters', () => {
    const forbidden = /token|secret|password|api_?key|credential/i;
    for (const tool of HUBSPOT_TOOLS) {
      for (const param of tool.parameters) {
        expect(param.name).not.toMatch(forbidden);
      }
    }
  });
});

describe('create_contact tool', () => {
  const tool = HUBSPOT_TOOLS.find((t) => t.slug === 'create_contact');
  it('exists', () => expect(tool).toBeDefined());
  it('is POST to contacts endpoint', () => {
    expect(tool!.http.method).toBe('POST');
    expect(tool!.http.path).toContain('contacts');
  });
  it('requires properties body param', () => {
    const paramNames = tool!.parameters.map((p) => p.name);
    expect(paramNames).toContain('properties');
  });
});

describe('search_contacts tool', () => {
  const tool = HUBSPOT_TOOLS.find((t) => t.slug === 'search_contacts');
  it('exists and is read-only', () => {
    expect(tool).toBeDefined();
    expect(tool!.read_only).toBe(true);
  });
  it('is POST to search endpoint', () => {
    expect(tool!.http.path).toContain('search');
  });
});

describe('HubSpot OAuth helpers', () => {
  it('generateCodeVerifier is 64 chars', () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('buildAuthorizationUrl targets app.hubspot.com', () => {
    const url = new URL(buildAuthorizationUrl({
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['crm.objects.contacts.read'],
      state: generateState(),
    }));
    expect(url.hostname).toBe('app.hubspot.com');
  });

  it('startOAuthFlow returns url, state, codeVerifier', () => {
    const r = startOAuthFlow({ clientId: 'c', redirectUri: 'https://arcane.dev/cb', scopes: ['contacts.read'] });
    expect(typeof r.url).toBe('string');
    expect(typeof r.state).toBe('string');
    expect(typeof r.codeVerifier).toBe('string');
  });

  it('state in URL matches returned state', () => {
    const r = startOAuthFlow({ clientId: 'c', redirectUri: 'https://arcane.dev/cb', scopes: ['contacts.read'] });
    const url = new URL(r.url);
    expect(url.searchParams.get('state')).toBe(r.state);
  });

  it('validateState timing-safe', () => {
    const s = generateState();
    expect(validateState(s, s)).toBe(true);
    expect(validateState(s, generateState())).toBe(false);
  });
});
