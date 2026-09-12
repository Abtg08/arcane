/**
 * Notion connector — contract tests.
 */

import { describe, it, expect } from 'vitest';
import { NOTION_CONNECTOR_DEF, NOTION_TOOLS } from './index.js';
import {
  generateCodeVerifier,
  generateState,
  buildAuthorizationUrl,
  startOAuthFlow,
  validateState,
} from './oauth.js';

describe('NOTION_CONNECTOR_DEF', () => {
  it('has required identity fields', () => {
    expect(NOTION_CONNECTOR_DEF.id).toBe('notion');
    expect(NOTION_CONNECTOR_DEF.slug).toBe('notion');
    expect(NOTION_CONNECTOR_DEF.name).toBe('Notion');
    expect(NOTION_CONNECTOR_DEF.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('uses Notion API base URL', () => {
    expect(NOTION_CONNECTOR_DEF.base_url).toBe('https://api.notion.com/v1');
  });

  it('has Notion-Version header', () => {
    expect(NOTION_CONNECTOR_DEF.default_headers?.['Notion-Version']).toBeTruthy();
  });

  it('is oauth2 type', () => {
    expect(NOTION_CONNECTOR_DEF.auth.type).toBe('oauth2');
  });

  it('pkce is false (Notion does not support PKCE)', () => {
    const { auth } = NOTION_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.pkce).toBe(false);
    }
  });

  it('tools array matches NOTION_TOOLS', () => {
    expect(NOTION_CONNECTOR_DEF.tools).toBe(NOTION_TOOLS);
  });
});

describe('NOTION_TOOLS', () => {
  it('has at least 6 tools', () => {
    expect(NOTION_TOOLS.length).toBeGreaterThanOrEqual(6);
  });

  it('all tools have required fields', () => {
    for (const tool of NOTION_TOOLS) {
      expect(typeof tool.slug).toBe('string');
      expect(typeof tool.name).toBe('string');
      expect(Array.isArray(tool.risk_level)).toBe(true);
      expect(typeof tool.http.method).toBe('string');
      expect(typeof tool.http.path).toBe('string');
    }
  });

  it('slugs are unique', () => {
    const slugs = NOTION_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('no credential parameters', () => {
    const forbidden = /token|secret|password|api_?key|credential/i;
    for (const tool of NOTION_TOOLS) {
      for (const param of tool.parameters) {
        expect(param.name).not.toMatch(forbidden);
      }
    }
  });
});

describe('query_database tool', () => {
  const tool = NOTION_TOOLS.find((t) => t.slug === 'query_database');
  it('exists and is POST', () => {
    expect(tool).toBeDefined();
    expect(tool!.http.method).toBe('POST');
  });
  it('supports filter and sorts', () => {
    const paramNames = tool!.parameters.map((p) => p.name);
    expect(paramNames).toContain('filter');
    expect(paramNames).toContain('sorts');
  });
  it('is read-only', () => expect(tool!.read_only).toBe(true));
});

describe('create_page tool', () => {
  const tool = NOTION_TOOLS.find((t) => t.slug === 'create_page');
  it('exists', () => expect(tool).toBeDefined());
  it('requires parent and properties', () => {
    const required = tool!.http.body_schema?.required ?? [];
    expect(required).toContain('parent');
    expect(required).toContain('properties');
  });
});

describe('Notion OAuth helpers', () => {
  it('generateCodeVerifier is 64 base64url chars', () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('buildAuthorizationUrl targets api.notion.com', () => {
    const url = new URL(buildAuthorizationUrl({
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      state: generateState(),
    }));
    expect(url.hostname).toBe('api.notion.com');
    expect(url.searchParams.get('owner')).toBe('user');
  });

  it('startOAuthFlow returns url, state, codeVerifier', () => {
    const r = startOAuthFlow({ clientId: 'c', redirectUri: 'https://arcane.dev/cb' });
    expect(typeof r.url).toBe('string');
    expect(typeof r.state).toBe('string');
    expect(typeof r.codeVerifier).toBe('string');
  });

  it('validateState timing-safe', () => {
    const s = generateState();
    expect(validateState(s, s)).toBe(true);
    expect(validateState(s, generateState())).toBe(false);
    expect(validateState('', s)).toBe(false);
  });
});
