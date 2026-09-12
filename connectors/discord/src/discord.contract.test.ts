/**
 * Discord connector — contract tests.
 */

import { describe, it, expect } from 'vitest';
import { DISCORD_CONNECTOR_DEF, DISCORD_TOOLS } from './index.js';
import {
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  startOAuthFlow,
  validateState,
} from './oauth.js';

describe('DISCORD_CONNECTOR_DEF', () => {
  it('has required identity fields', () => {
    expect(DISCORD_CONNECTOR_DEF.id).toBe('discord');
    expect(DISCORD_CONNECTOR_DEF.slug).toBe('discord');
    expect(DISCORD_CONNECTOR_DEF.name).toBe('Discord');
    expect(DISCORD_CONNECTOR_DEF.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has valid base_url', () => {
    expect(DISCORD_CONNECTOR_DEF.base_url).toBe('https://discord.com/api/v10');
  });

  it('has oauth2 auth type', () => {
    expect(DISCORD_CONNECTOR_DEF.auth.type).toBe('oauth2');
  });

  it('has pkce enabled', () => {
    const { auth } = DISCORD_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.pkce).toBe(true);
    }
  });

  it('supports token refresh', () => {
    const { auth } = DISCORD_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.refresh_supported).toBe(true);
    }
  });

  it('tools array matches DISCORD_TOOLS', () => {
    expect(DISCORD_CONNECTOR_DEF.tools).toBe(DISCORD_TOOLS);
  });
});

describe('DISCORD_TOOLS', () => {
  it('has at least 5 tools', () => {
    expect(DISCORD_TOOLS.length).toBeGreaterThanOrEqual(5);
  });

  it('all tools have required fields', () => {
    for (const tool of DISCORD_TOOLS) {
      expect(typeof tool.slug).toBe('string');
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(Array.isArray(tool.risk_level)).toBe(true);
      expect(typeof tool.read_only).toBe('boolean');
      expect(typeof tool.destructive).toBe('boolean');
      expect(typeof tool.idempotent).toBe('boolean');
      expect(typeof tool.http.method).toBe('string');
      expect(typeof tool.http.path).toBe('string');
    }
  });

  it('slugs are unique', () => {
    const slugs = DISCORD_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('no tool has credential parameters', () => {
    const forbidden = /token|secret|password|api_?key|credential/i;
    for (const tool of DISCORD_TOOLS) {
      for (const param of tool.parameters) {
        expect(param.name).not.toMatch(forbidden);
      }
    }
  });
});

describe('send_message tool', () => {
  const tool = DISCORD_TOOLS.find((t) => t.slug === 'send_message');

  it('exists', () => expect(tool).toBeDefined());
  it('is POST /channels/{channel_id}/messages', () => {
    expect(tool!.http.method).toBe('POST');
    expect(tool!.http.path).toBe('/channels/{channel_id}/messages');
  });
  it('has EXTERNAL_COMMUNICATION risk', () => {
    expect(tool!.risk_level).toContain('EXTERNAL_COMMUNICATION');
  });
  it('requires channel_id path param and content body param', () => {
    const paramNames = tool!.parameters.map((p) => p.name);
    expect(paramNames).toContain('channel_id');
    expect(paramNames).toContain('content');
  });
});

describe('list_guilds tool', () => {
  const tool = DISCORD_TOOLS.find((t) => t.slug === 'list_guilds');
  it('exists', () => expect(tool).toBeDefined());
  it('is GET /users/@me/guilds', () => {
    expect(tool!.http.method).toBe('GET');
    expect(tool!.http.path).toBe('/users/@me/guilds');
  });
  it('is read-only', () => expect(tool!.read_only).toBe(true));
});

describe('OAuth helpers', () => {
  it('generateCodeVerifier returns base64url string', () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('deriveCodeChallenge is deterministic', () => {
    const v = generateCodeVerifier();
    expect(deriveCodeChallenge(v)).toBe(deriveCodeChallenge(v));
  });

  it('generateState returns 43 chars', () => {
    expect(generateState()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('buildAuthorizationUrl uses discord.com domain', () => {
    const url = new URL(buildAuthorizationUrl({
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['identify'],
      state: generateState(),
      codeChallenge: deriveCodeChallenge(generateCodeVerifier()),
    }));
    expect(url.hostname).toBe('discord.com');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('startOAuthFlow codeVerifier matches challenge in URL', () => {
    const r = startOAuthFlow({ clientId: 'c', redirectUri: 'https://arcane.dev/cb', scopes: ['guilds'] });
    const url = new URL(r.url);
    expect(url.searchParams.get('code_challenge')).toBe(deriveCodeChallenge(r.codeVerifier));
  });

  it('validateState: matching', () => {
    const s = generateState();
    expect(validateState(s, s)).toBe(true);
  });

  it('validateState: mismatch', () => {
    expect(validateState(generateState(), generateState())).toBe(false);
  });
});
