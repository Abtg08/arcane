/**
 * Google Calendar connector — contract tests.
 */

import { describe, it, expect } from 'vitest';
import { GOOGLE_CALENDAR_CONNECTOR_DEF, GOOGLE_CALENDAR_TOOLS } from './index.js';
import {
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  startOAuthFlow,
  validateState,
} from './oauth.js';

describe('GOOGLE_CALENDAR_CONNECTOR_DEF', () => {
  it('has required identity fields', () => {
    expect(GOOGLE_CALENDAR_CONNECTOR_DEF.id).toBe('google-calendar');
    expect(GOOGLE_CALENDAR_CONNECTOR_DEF.slug).toBe('google-calendar');
    expect(GOOGLE_CALENDAR_CONNECTOR_DEF.name).toBe('Google Calendar');
    expect(GOOGLE_CALENDAR_CONNECTOR_DEF.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('uses Google Calendar base URL', () => {
    expect(GOOGLE_CALENDAR_CONNECTOR_DEF.base_url).toBe('https://www.googleapis.com/calendar/v3');
  });

  it('has oauth2 with pkce and refresh', () => {
    const { auth } = GOOGLE_CALENDAR_CONNECTOR_DEF;
    expect(auth.type).toBe('oauth2');
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.pkce).toBe(true);
      expect(auth.oauth2.refresh_supported).toBe(true);
    }
  });

  it('scopes include calendar permissions', () => {
    const { auth } = GOOGLE_CALENDAR_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      const scopeStr = auth.oauth2.scopes.join(' ');
      expect(scopeStr).toContain('calendar');
    }
  });

  it('tools array matches GOOGLE_CALENDAR_TOOLS', () => {
    expect(GOOGLE_CALENDAR_CONNECTOR_DEF.tools).toBe(GOOGLE_CALENDAR_TOOLS);
  });
});

describe('GOOGLE_CALENDAR_TOOLS', () => {
  it('has at least 5 tools', () => {
    expect(GOOGLE_CALENDAR_TOOLS.length).toBeGreaterThanOrEqual(5);
  });

  it('all tools have required fields', () => {
    for (const tool of GOOGLE_CALENDAR_TOOLS) {
      expect(typeof tool.slug).toBe('string');
      expect(typeof tool.name).toBe('string');
      expect(Array.isArray(tool.risk_level)).toBe(true);
      expect(typeof tool.read_only).toBe('boolean');
      expect(typeof tool.destructive).toBe('boolean');
      expect(typeof tool.http.method).toBe('string');
      expect(typeof tool.http.path).toBe('string');
    }
  });

  it('slugs are unique', () => {
    const slugs = GOOGLE_CALENDAR_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('delete_event is marked destructive', () => {
    const tool = GOOGLE_CALENDAR_TOOLS.find((t) => t.slug === 'delete_event');
    expect(tool?.destructive).toBe(true);
  });

  it('no credential parameters', () => {
    const forbidden = /token|secret|password|api_?key|credential/i;
    for (const tool of GOOGLE_CALENDAR_TOOLS) {
      for (const param of tool.parameters) {
        expect(param.name).not.toMatch(forbidden);
      }
    }
  });
});

describe('create_event tool', () => {
  const tool = GOOGLE_CALENDAR_TOOLS.find((t) => t.slug === 'create_event');

  it('exists and is POST', () => {
    expect(tool).toBeDefined();
    expect(tool!.http.method).toBe('POST');
  });

  it('requires summary, start, end', () => {
    const required = tool!.http.body_schema?.required ?? [];
    expect(required).toContain('summary');
    expect(required).toContain('start');
    expect(required).toContain('end');
  });

  it('supports attendees', () => {
    const props = tool!.http.body_schema?.properties ?? {};
    expect(props).toHaveProperty('attendees');
  });
});

describe('Google Calendar OAuth helpers', () => {
  it('generateCodeVerifier returns 64 chars', () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('buildAuthorizationUrl targets accounts.google.com', () => {
    const url = new URL(buildAuthorizationUrl({
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      state: generateState(),
      codeChallenge: deriveCodeChallenge(generateCodeVerifier()),
    }));
    expect(url.hostname).toBe('accounts.google.com');
  });

  it('startOAuthFlow codeVerifier matches challenge', () => {
    const r = startOAuthFlow({ clientId: 'c', redirectUri: 'https://arcane.dev/cb', scopes: ['calendar'] });
    const url = new URL(r.url);
    expect(url.searchParams.get('code_challenge')).toBe(deriveCodeChallenge(r.codeVerifier));
  });

  it('validateState', () => {
    const s = generateState();
    expect(validateState(s, s)).toBe(true);
    expect(validateState(s, generateState())).toBe(false);
  });
});
