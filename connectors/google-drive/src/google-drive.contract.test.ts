/**
 * Google Drive connector — contract tests.
 */

import { describe, it, expect } from 'vitest';
import { GOOGLE_DRIVE_CONNECTOR_DEF, GOOGLE_DRIVE_TOOLS } from './index.js';
import {
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  startOAuthFlow,
  validateState,
} from './oauth.js';

describe('GOOGLE_DRIVE_CONNECTOR_DEF', () => {
  it('has required identity fields', () => {
    expect(GOOGLE_DRIVE_CONNECTOR_DEF.id).toBe('google-drive');
    expect(GOOGLE_DRIVE_CONNECTOR_DEF.slug).toBe('google-drive');
    expect(GOOGLE_DRIVE_CONNECTOR_DEF.name).toBe('Google Drive');
    expect(GOOGLE_DRIVE_CONNECTOR_DEF.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('uses Google Drive v3 base URL', () => {
    expect(GOOGLE_DRIVE_CONNECTOR_DEF.base_url).toBe('https://www.googleapis.com/drive/v3');
  });

  it('has oauth2 with pkce', () => {
    const { auth } = GOOGLE_DRIVE_CONNECTOR_DEF;
    if (auth.type === 'oauth2') {
      expect(auth.oauth2.pkce).toBe(true);
      expect(auth.oauth2.refresh_supported).toBe(true);
    }
  });

  it('tools array matches GOOGLE_DRIVE_TOOLS', () => {
    expect(GOOGLE_DRIVE_CONNECTOR_DEF.tools).toBe(GOOGLE_DRIVE_TOOLS);
  });
});

describe('GOOGLE_DRIVE_TOOLS', () => {
  it('has at least 5 tools', () => {
    expect(GOOGLE_DRIVE_TOOLS.length).toBeGreaterThanOrEqual(5);
  });

  it('all tools have required fields', () => {
    for (const tool of GOOGLE_DRIVE_TOOLS) {
      expect(typeof tool.slug).toBe('string');
      expect(typeof tool.name).toBe('string');
      expect(Array.isArray(tool.risk_level)).toBe(true);
      expect(typeof tool.read_only).toBe('boolean');
      expect(typeof tool.http.method).toBe('string');
      expect(typeof tool.http.path).toBe('string');
    }
  });

  it('slugs are unique', () => {
    const slugs = GOOGLE_DRIVE_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('delete_file is marked destructive', () => {
    const tool = GOOGLE_DRIVE_TOOLS.find((t) => t.slug === 'delete_file');
    expect(tool?.destructive).toBe(true);
  });

  it('list_files is read-only', () => {
    const tool = GOOGLE_DRIVE_TOOLS.find((t) => t.slug === 'list_files');
    expect(tool?.read_only).toBe(true);
  });

  it('no credential parameters', () => {
    const forbidden = /token|secret|password|api_?key|credential/i;
    for (const tool of GOOGLE_DRIVE_TOOLS) {
      for (const param of tool.parameters) {
        expect(param.name).not.toMatch(forbidden);
      }
    }
  });
});

describe('list_files tool', () => {
  const tool = GOOGLE_DRIVE_TOOLS.find((t) => t.slug === 'list_files');
  it('exists', () => expect(tool).toBeDefined());
  it('supports q search param', () => {
    expect(tool!.parameters.map((p) => p.name)).toContain('q');
  });
});

describe('create_file tool', () => {
  const tool = GOOGLE_DRIVE_TOOLS.find((t) => t.slug === 'create_file');
  it('exists', () => expect(tool).toBeDefined());
  it('is POST', () => expect(tool!.http.method).toBe('POST'));
  it('supports mimeType for folders', () => {
    const props = tool!.http.body_schema?.properties ?? {};
    expect(props).toHaveProperty('mimeType');
  });
});

describe('Google Drive OAuth helpers', () => {
  it('generateCodeVerifier is 64 chars', () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('buildAuthorizationUrl targets accounts.google.com', () => {
    const url = new URL(buildAuthorizationUrl({
      clientId: 'c',
      redirectUri: 'https://arcane.dev/cb',
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      state: generateState(),
      codeChallenge: deriveCodeChallenge(generateCodeVerifier()),
    }));
    expect(url.hostname).toBe('accounts.google.com');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('startOAuthFlow returns all fields', () => {
    const r = startOAuthFlow({ clientId: 'c', redirectUri: 'https://arcane.dev/cb', scopes: ['drive'] });
    expect(['url', 'state', 'codeVerifier'].every((k) => k in r)).toBe(true);
  });

  it('validateState', () => {
    const s = generateState();
    expect(validateState(s, s)).toBe(true);
    expect(validateState(s, generateState())).toBe(false);
  });
});
