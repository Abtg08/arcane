/**
 * GitHub connector — contract tests.
 *
 * Pure logic tests: no HTTP, no GitHub API calls.
 * Validates tool definitions, OAuth helpers, and connector def structure.
 */

import { describe, it, expect } from 'vitest';
import { GITHUB_CONNECTOR_DEF, GITHUB_TOOLS, getGitHubTool } from './index.js';
import {
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  startOAuthFlow,
  validateState,
  buildAuthorizationUrl,
} from './oauth.js';

// ── ConnectorDef ──────────────────────────────────────────────────────────────

describe('GITHUB_CONNECTOR_DEF', () => {
  it('has required top-level fields', () => {
    expect(GITHUB_CONNECTOR_DEF.id).toBe('github');
    expect(GITHUB_CONNECTOR_DEF.slug).toBe('github');
    expect(GITHUB_CONNECTOR_DEF.base_url).toBe('https://api.github.com');
    expect(GITHUB_CONNECTOR_DEF.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('auth is oauth2 with PKCE enabled (SI-16)', () => {
    expect(GITHUB_CONNECTOR_DEF.auth.type).toBe('oauth2');
    const { oauth2 } = GITHUB_CONNECTOR_DEF.auth;
    expect(oauth2.pkce).toBe(true);
    expect(oauth2.scopes.length).toBeGreaterThan(0);
    expect(oauth2.authorization_url).toContain('github.com');
    expect(oauth2.token_url).toContain('github.com');
  });

  it('default_headers include Accept and X-GitHub-Api-Version', () => {
    const h = GITHUB_CONNECTOR_DEF.default_headers ?? {};
    expect(h['Accept']).toContain('vnd.github');
    expect(h['X-GitHub-Api-Version']).toBeTruthy();
  });

  it('tools array matches GITHUB_TOOLS', () => {
    expect(GITHUB_CONNECTOR_DEF.tools).toBe(GITHUB_TOOLS);
  });
});

// ── Tool definitions ──────────────────────────────────────────────────────────

describe('GITHUB_TOOLS', () => {
  it('has exactly 10 tools', () => {
    expect(GITHUB_TOOLS).toHaveLength(10);
  });

  it('all slugs are unique', () => {
    const slugs = GITHUB_TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('all tools have required fields', () => {
    for (const tool of GITHUB_TOOLS) {
      expect(tool.slug, `${tool.slug} missing slug`).toBeTruthy();
      expect(tool.name, `${tool.slug} missing name`).toBeTruthy();
      expect(tool.description, `${tool.slug} missing description`).toBeTruthy();
      expect(tool.risk_level, `${tool.slug} missing risk_level`).toBeDefined();
      expect(tool.http, `${tool.slug} missing http`).toBeDefined();
      expect(tool.parameters, `${tool.slug} missing parameters`).toBeDefined();
    }
  });

  it('read_only tools have READ_ONLY risk level', () => {
    for (const tool of GITHUB_TOOLS) {
      if (tool.read_only) {
        expect(tool.risk_level, `${tool.slug} read_only but missing READ_ONLY risk`)
          .toContain('READ_ONLY');
      }
    }
  });

  it('write tools have WRITE risk level', () => {
    const writeTools = GITHUB_TOOLS.filter((t) => !t.read_only);
    for (const tool of writeTools) {
      expect(tool.risk_level, `${tool.slug} is write but missing WRITE risk`)
        .toContain('WRITE');
    }
  });

  it('destructive is false for all tools (none delete)', () => {
    for (const tool of GITHUB_TOOLS) {
      expect(tool.destructive, `${tool.slug} should not be destructive`).toBe(false);
    }
  });

  it('all required parameters are marked required: true', () => {
    for (const tool of GITHUB_TOOLS) {
      for (const param of tool.parameters) {
        if (param.required) {
          expect(typeof param.name, `${tool.slug}.${param.name} missing name`).toBe('string');
          expect(['path', 'query', 'body'], `${tool.slug}.${param.name} bad 'in'`)
            .toContain(param.in);
        }
      }
    }
  });

  it('no credential-like fields in parameter names (SI-01)', () => {
    const credentialKeys = ['token', 'secret', 'password', 'api_key', 'authorization'];
    for (const tool of GITHUB_TOOLS) {
      for (const param of tool.parameters) {
        const lower = param.name.toLowerCase();
        for (const key of credentialKeys) {
          expect(lower, `${tool.slug}.${param.name} looks like a credential param`)
            .not.toBe(key);
        }
      }
    }
  });
});

// ── Tool lookup ───────────────────────────────────────────────────────────────

describe('getGitHubTool', () => {
  it('returns tool by slug', () => {
    const tool = getGitHubTool('list_issues');
    expect(tool).toBeDefined();
    expect(tool?.slug).toBe('list_issues');
  });

  it('returns undefined for unknown slug', () => {
    expect(getGitHubTool('does_not_exist')).toBeUndefined();
  });

  it('can look up all 10 tools', () => {
    for (const tool of GITHUB_TOOLS) {
      expect(getGitHubTool(tool.slug)).toBe(tool);
    }
  });
});

// ── Individual tool contracts ─────────────────────────────────────────────────

describe('list_issues', () => {
  it('is a GET with correct path', () => {
    const t = getGitHubTool('list_issues')!;
    expect(t.http.method).toBe('GET');
    expect(t.http.path).toBe('/repos/{owner}/{repo}/issues');
  });

  it('has owner and repo as required path params', () => {
    const t = getGitHubTool('list_issues')!;
    const owner = t.parameters.find((p) => p.name === 'owner');
    const repo = t.parameters.find((p) => p.name === 'repo');
    expect(owner?.required).toBe(true);
    expect(owner?.in).toBe('path');
    expect(repo?.required).toBe(true);
    expect(repo?.in).toBe('path');
  });

  it('state defaults to open', () => {
    const t = getGitHubTool('list_issues')!;
    const state = t.parameters.find((p) => p.name === 'state');
    expect(state?.default).toBe('open');
    expect(state?.enum).toContain('closed');
  });
});

describe('create_issue', () => {
  it('is a POST', () => {
    const t = getGitHubTool('create_issue')!;
    expect(t.http.method).toBe('POST');
  });

  it('title is required body param', () => {
    const t = getGitHubTool('create_issue')!;
    const title = t.parameters.find((p) => p.name === 'title');
    expect(title?.required).toBe(true);
    expect(title?.in).toBe('body');
  });

  it('body_schema requires title', () => {
    const t = getGitHubTool('create_issue')!;
    expect(t.http.body_schema?.['required']).toContain('title');
  });
});

describe('create_pull_request', () => {
  it('requires title, head, base', () => {
    const t = getGitHubTool('create_pull_request')!;
    const required = t.parameters.filter((p) => p.required).map((p) => p.name);
    expect(required).toContain('title');
    expect(required).toContain('head');
    expect(required).toContain('base');
  });

  it('draft defaults to false', () => {
    const t = getGitHubTool('create_pull_request')!;
    const draft = t.parameters.find((p) => p.name === 'draft');
    expect(draft?.default).toBe(false);
  });
});

describe('create_issue_comment', () => {
  it('has EXTERNAL_COMMUNICATION risk (SI-05 untrusted data concern)', () => {
    const t = getGitHubTool('create_issue_comment')!;
    expect(t.risk_level).toContain('EXTERNAL_COMMUNICATION');
  });

  it('body param is required', () => {
    const t = getGitHubTool('create_issue_comment')!;
    const body = t.parameters.find((p) => p.name === 'body');
    expect(body?.required).toBe(true);
  });
});

// ── OAuth helpers ─────────────────────────────────────────────────────────────

describe('generateCodeVerifier', () => {
  it('generates URL-safe base64url string', () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('generates at least 43 chars (RFC 7636 minimum)', () => {
    expect(generateCodeVerifier().length).toBeGreaterThanOrEqual(43);
  });

  it('generates unique values', () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe('deriveCodeChallenge', () => {
  it('is deterministic for same verifier', () => {
    const v = generateCodeVerifier();
    expect(deriveCodeChallenge(v)).toBe(deriveCodeChallenge(v));
  });

  it('produces base64url output (no +, /, =)', () => {
    const c = deriveCodeChallenge(generateCodeVerifier());
    expect(c).not.toContain('+');
    expect(c).not.toContain('/');
    expect(c).not.toContain('=');
  });

  it('known S256 vector', () => {
    // RFC 7636 Appendix B
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = deriveCodeChallenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('generateState', () => {
  it('is at least 32 chars', () => {
    expect(generateState().length).toBeGreaterThanOrEqual(32);
  });

  it('is unique per call', () => {
    expect(generateState()).not.toBe(generateState());
  });
});

describe('startOAuthFlow', () => {
  const opts = {
    clientId: 'test_client_id',
    redirectUri: 'https://app.example.com/callback',
    scopes: ['repo', 'read:user'],
  };

  it('returns url, state, and codeVerifier', () => {
    const result = startOAuthFlow(opts);
    expect(result.url).toBeTruthy();
    expect(result.state).toBeTruthy();
    expect(result.codeVerifier).toBeTruthy();
  });

  it('url contains client_id and redirect_uri', () => {
    const { url } = startOAuthFlow(opts);
    expect(url).toContain('client_id=test_client_id');
    expect(url).toContain(encodeURIComponent(opts.redirectUri));
  });

  it('url contains code_challenge_method=S256 (SI-16)', () => {
    const { url } = startOAuthFlow(opts);
    expect(url).toContain('code_challenge_method=S256');
  });

  it('url contains scopes', () => {
    const { url } = startOAuthFlow(opts);
    expect(url).toContain('scope=');
  });

  it('url contains state', () => {
    const { url, state } = startOAuthFlow(opts);
    expect(url).toContain(`state=${state}`);
  });

  it('code_challenge in url matches deriveCodeChallenge(codeVerifier)', () => {
    const { url, codeVerifier } = startOAuthFlow(opts);
    const parsed = new URL(url);
    const challenge = parsed.searchParams.get('code_challenge');
    expect(challenge).toBe(deriveCodeChallenge(codeVerifier));
  });

  it('two calls produce different state tokens (SI-16 uniqueness)', () => {
    const a = startOAuthFlow(opts);
    const b = startOAuthFlow(opts);
    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});

describe('buildAuthorizationUrl', () => {
  it('points to github.com', () => {
    const url = buildAuthorizationUrl({
      clientId: 'cid',
      redirectUri: 'https://app.example.com/cb',
      scopes: ['repo'],
      state: 'st',
      codeChallenge: 'cc',
    });
    expect(url).toContain('github.com/login/oauth/authorize');
  });
});

describe('validateState (SI-16)', () => {
  it('returns true for matching states', () => {
    const s = generateState();
    expect(validateState(s, s)).toBe(true);
  });

  it('returns false for mismatched states', () => {
    expect(validateState(generateState(), generateState())).toBe(false);
  });

  it('returns false when lengths differ', () => {
    expect(validateState('abc', 'abcd')).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(validateState('', '')).toBe(false);
  });
});
