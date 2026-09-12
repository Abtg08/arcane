/**
 * Slack connector — contract tests.
 * These are pure unit tests — no network calls, no credentials.
 */

import { describe, it, expect } from 'vitest';
import { SLACK_CONNECTOR_DEF, SLACK_TOOLS } from './index.js';
import {
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  startOAuthFlow,
  validateState,
} from './oauth.js';

// ── ConnectorDef structure ────────────────────────────────────────────────────

describe('SLACK_CONNECTOR_DEF', () => {
  it('has required identity fields', () => {
    expect(SLACK_CONNECTOR_DEF.id).toBe('slack');
    expect(SLACK_CONNECTOR_DEF.slug).toBe('slack');
    expect(SLACK_CONNECTOR_DEF.name).toBe('Slack');
    expect(SLACK_CONNECTOR_DEF.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('has valid base_url', () => {
    expect(SLACK_CONNECTOR_DEF.base_url).toBe('https://slack.com/api');
  });

  it('has oauth2 auth type', () => {
    expect(SLACK_CONNECTOR_DEF.auth.type).toBe('oauth2');
  });

  it('has at least one scope', () => {
    const { auth } = SLACK_CONNECTOR_DEF;
    expect(auth.type).toBe('oauth2');
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.scopes.length).toBeGreaterThan(0);
    }
  });

  it('has pkce enabled', () => {
    const { auth } = SLACK_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.pkce).toBe(true);
    }
  });

  it('tools array matches SLACK_TOOLS', () => {
    expect(SLACK_CONNECTOR_DEF.tools).toBe(SLACK_TOOLS);
  });

  it('has connect_hint', () => {
    expect(typeof SLACK_CONNECTOR_DEF.auth.connect_hint).toBe('string');
    expect(SLACK_CONNECTOR_DEF.auth.connect_hint!.length).toBeGreaterThan(0);
  });
});

// ── Tool field contracts ──────────────────────────────────────────────────────

describe('SLACK_TOOLS', () => {
  it('has at least 5 tools', () => {
    expect(SLACK_TOOLS.length).toBeGreaterThanOrEqual(5);
  });

  it('all tools have required fields', () => {
    for (const tool of SLACK_TOOLS) {
      expect(typeof tool.slug).toBe('string');
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(Array.isArray(tool.risk_level)).toBe(true);
      expect(tool.risk_level.length).toBeGreaterThan(0);
      expect(typeof tool.read_only).toBe('boolean');
      expect(typeof tool.destructive).toBe('boolean');
      expect(typeof tool.idempotent).toBe('boolean');
      expect(typeof tool.http).toBe('object');
      expect(typeof tool.http.method).toBe('string');
      expect(typeof tool.http.path).toBe('string');
      expect(Array.isArray(tool.parameters)).toBe(true);
    }
  });

  it('slugs are unique', () => {
    const slugs = SLACK_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('read_only tools have READ_ONLY risk_level', () => {
    for (const tool of SLACK_TOOLS) {
      if (tool.read_only) {
        expect(tool.risk_level).toContain('READ_ONLY');
      }
    }
  });

  it('WRITE tools are not read_only', () => {
    for (const tool of SLACK_TOOLS) {
      if (tool.risk_level.includes('WRITE')) {
        expect(tool.read_only).toBe(false);
      }
    }
  });

  it('no tool has credential parameters', () => {
    const forbidden = /token|secret|password|api_?key|credential/i;
    for (const tool of SLACK_TOOLS) {
      for (const param of tool.parameters) {
        expect(param.name).not.toMatch(forbidden);
      }
    }
  });
});

// ── Individual tool contracts ────────────────────────────────────────────────

describe('list_channels tool', () => {
  const tool = SLACK_TOOLS.find((t) => t.slug === 'list_channels');

  it('exists', () => expect(tool).toBeDefined());
  it('is GET /conversations.list', () => {
    expect(tool!.http.method).toBe('GET');
    expect(tool!.http.path).toBe('/conversations.list');
  });
  it('is read-only', () => expect(tool!.read_only).toBe(true));
});

describe('send_message tool', () => {
  const tool = SLACK_TOOLS.find((t) => t.slug === 'send_message');

  it('exists', () => expect(tool).toBeDefined());
  it('is POST /chat.postMessage', () => {
    expect(tool!.http.method).toBe('POST');
    expect(tool!.http.path).toBe('/chat.postMessage');
  });
  it('is not read-only', () => expect(tool!.read_only).toBe(false));
  it('has EXTERNAL_COMMUNICATION risk', () => {
    expect(tool!.risk_level).toContain('EXTERNAL_COMMUNICATION');
  });
  it('requires channel and text params', () => {
    const paramNames = tool!.parameters.map((p) => p.name);
    expect(paramNames).toContain('channel');
    expect(paramNames).toContain('text');
  });
  it('has body_schema', () => {
    expect(tool!.http.body_schema).toBeDefined();
  });
});

// ── OAuth helpers ─────────────────────────────────────────────────────────────

describe('generateCodeVerifier', () => {
  it('returns a non-empty string', () => {
    expect(generateCodeVerifier().length).toBeGreaterThan(0);
  });

  it('returns 64 base64url chars', () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('returns different values each call', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe('deriveCodeChallenge', () => {
  it('returns base64url encoded SHA-256', () => {
    const verifier = generateCodeVerifier();
    const challenge = deriveCodeChallenge(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge.length).toBeGreaterThan(0);
  });

  it('is deterministic', () => {
    const v = generateCodeVerifier();
    expect(deriveCodeChallenge(v)).toBe(deriveCodeChallenge(v));
  });
});

describe('generateState', () => {
  it('returns 43 base64url chars', () => {
    expect(generateState()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('returns unique values', () => {
    expect(generateState()).not.toBe(generateState());
  });
});

describe('buildAuthorizationUrl', () => {
  const params = {
    clientId: 'test-client',
    redirectUri: 'https://app.arcane.dev/oauth/callback',
    scopes: ['channels:read', 'chat:write'],
    state: generateState(),
    codeChallenge: deriveCodeChallenge(generateCodeVerifier()),
  };

  it('returns a valid Slack auth URL', () => {
    const url = new URL(buildAuthorizationUrl(params));
    expect(url.origin).toBe('https://slack.com');
    expect(url.pathname).toBe('/oauth/v2/authorize');
  });

  it('includes all required params', () => {
    const url = new URL(buildAuthorizationUrl(params));
    expect(url.searchParams.get('client_id')).toBe('test-client');
    expect(url.searchParams.get('state')).toBe(params.state);
    expect(url.searchParams.get('code_challenge')).toBe(params.codeChallenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});

describe('startOAuthFlow', () => {
  it('returns url, state and codeVerifier', () => {
    const result = startOAuthFlow({
      clientId: 'test',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['channels:read'],
    });
    expect(typeof result.url).toBe('string');
    expect(typeof result.state).toBe('string');
    expect(typeof result.codeVerifier).toBe('string');
  });

  it('derived challenge in URL matches codeVerifier', () => {
    const result = startOAuthFlow({
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['chat:write'],
    });
    const url = new URL(result.url);
    expect(url.searchParams.get('code_challenge')).toBe(
      deriveCodeChallenge(result.codeVerifier),
    );
  });
});

describe('validateState', () => {
  it('returns true for matching states', () => {
    const s = generateState();
    expect(validateState(s, s)).toBe(true);
  });

  it('returns false for mismatched states', () => {
    expect(validateState(generateState(), generateState())).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(validateState('', generateState())).toBe(false);
    expect(validateState(generateState(), '')).toBe(false);
  });
});
