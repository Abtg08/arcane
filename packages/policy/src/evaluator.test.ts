/**
 * Unit tests for the pure policy rule evaluator.
 * No DB, no network — fully deterministic.
 */

import { describe, it, expect } from 'vitest';
import { evaluateRules, mergeResults } from './evaluator.js';
import type { PolicyRules } from '@arcane/schemas';

const POLICY_ID = '00000000-0000-7000-8000-000000000001';

// ── helpers ───────────────────────────────────────────────────────────────────

function rules(overrides: Partial<PolicyRules> & { rules: PolicyRules['rules'] }): PolicyRules {
  return {
    version: '1',
    default_effect: 'deny',
    ...overrides,
  };
}

function input(toolkit: string, tool: string) {
  return { toolkit_slug: toolkit, tool_slug: tool, full_slug: `${toolkit}.${tool}` };
}

// ── exact match ───────────────────────────────────────────────────────────────

describe('exact tool match', () => {
  it('allows matching tool', () => {
    const r = evaluateRules(
      rules({ rules: [{ effect: 'allow', tools: ['github.list_repos'] }] }),
      input('github', 'list_repos'),
      POLICY_ID,
    );
    expect(r.decision).toBe('ALLOW');
    expect(r.matched_rule).not.toBeNull();
  });

  it('denies non-matching tool with deny default', () => {
    const r = evaluateRules(
      rules({ rules: [{ effect: 'allow', tools: ['github.list_repos'] }] }),
      input('github', 'delete_repo'),
      POLICY_ID,
    );
    expect(r.decision).toBe('DENY');
    expect(r.matched_rule).toBeNull();
  });
});

// ── wildcard match ────────────────────────────────────────────────────────────

describe('wildcard tool match', () => {
  it('matches all tools with "*"', () => {
    const r = evaluateRules(
      rules({ rules: [{ effect: 'allow', tools: ['*'] }] }),
      input('slack', 'send_message'),
      POLICY_ID,
    );
    expect(r.decision).toBe('ALLOW');
  });

  it('matches toolkit with "github.*"', () => {
    const r = evaluateRules(
      rules({ rules: [{ effect: 'allow', tools: ['github.*'] }] }),
      input('github', 'create_issue'),
      POLICY_ID,
    );
    expect(r.decision).toBe('ALLOW');
  });

  it('does not match different toolkit with "github.*"', () => {
    const r = evaluateRules(
      rules({ rules: [{ effect: 'allow', tools: ['github.*'] }] }),
      input('slack', 'send_message'),
      POLICY_ID,
    );
    expect(r.decision).toBe('DENY'); // default
  });
});

// ── toolkit list match ────────────────────────────────────────────────────────

describe('toolkit list match', () => {
  it('allows all tools in a toolkit', () => {
    const r = evaluateRules(
      rules({ rules: [{ effect: 'allow', toolkits: ['github'] }] }),
      input('github', 'any_tool'),
      POLICY_ID,
    );
    expect(r.decision).toBe('ALLOW');
  });

  it('denies toolkit not in list', () => {
    const r = evaluateRules(
      rules({ rules: [{ effect: 'allow', toolkits: ['github'] }] }),
      input('slack', 'send_message'),
      POLICY_ID,
    );
    expect(r.decision).toBe('DENY');
  });
});

// ── effect variants ───────────────────────────────────────────────────────────

describe('effect: require_confirmation', () => {
  it('returns REQUIRE_CONFIRMATION for matching rule', () => {
    const r = evaluateRules(
      rules({ rules: [{ effect: 'require_confirmation', tools: ['github.delete_repo'] }] }),
      input('github', 'delete_repo'),
      POLICY_ID,
    );
    expect(r.decision).toBe('REQUIRE_CONFIRMATION');
  });
});

describe('effect: deny', () => {
  it('returns DENY for matching deny rule', () => {
    const r = evaluateRules(
      rules({ rules: [{ effect: 'deny', tools: ['*'] }] }),
      input('github', 'list_repos'),
      POLICY_ID,
    );
    expect(r.decision).toBe('DENY');
  });
});

// ── first-match-wins ordering ─────────────────────────────────────────────────

describe('rule ordering — first match wins', () => {
  it('allow before deny means allow', () => {
    const r = evaluateRules(
      rules({
        rules: [
          { effect: 'allow', tools: ['github.list_repos'] },
          { effect: 'deny', tools: ['*'] },
        ],
      }),
      input('github', 'list_repos'),
      POLICY_ID,
    );
    expect(r.decision).toBe('ALLOW');
  });

  it('deny before allow means deny', () => {
    const r = evaluateRules(
      rules({
        rules: [
          { effect: 'deny', tools: ['*'] },
          { effect: 'allow', tools: ['github.list_repos'] },
        ],
      }),
      input('github', 'list_repos'),
      POLICY_ID,
    );
    expect(r.decision).toBe('DENY');
  });
});

// ── default_effect ────────────────────────────────────────────────────────────

describe('default_effect', () => {
  it('uses allow as default when no rule matches', () => {
    const r = evaluateRules(
      rules({ default_effect: 'allow', rules: [] }),
      input('github', 'list_repos'),
      POLICY_ID,
    );
    expect(r.decision).toBe('ALLOW');
    expect(r.matched_rule).toBeNull();
  });

  it('uses deny as default when no rule matches', () => {
    const r = evaluateRules(
      rules({ default_effect: 'deny', rules: [] }),
      input('github', 'list_repos'),
      POLICY_ID,
    );
    expect(r.decision).toBe('DENY');
  });
});

// ── merge ─────────────────────────────────────────────────────────────────────

describe('mergeResults', () => {
  it('returns implicit ALLOW when no policies', () => {
    const r = mergeResults([]);
    expect(r.decision).toBe('ALLOW');
    expect(r.evaluated_policies).toHaveLength(0);
  });

  it('DENY wins over ALLOW', () => {
    const allow = evaluateRules(
      rules({ default_effect: 'allow', rules: [] }),
      input('github', 'list_repos'),
      '00000000-0000-7000-8000-000000000001',
    );
    const deny = evaluateRules(
      rules({ rules: [{ effect: 'deny', tools: ['*'] }] }),
      input('github', 'list_repos'),
      '00000000-0000-7000-8000-000000000002',
    );
    const r = mergeResults([allow, deny]);
    expect(r.decision).toBe('DENY');
    expect(r.evaluated_policies).toHaveLength(2);
  });

  it('REQUIRE_CONFIRMATION beats ALLOW', () => {
    const allow = evaluateRules(
      rules({ default_effect: 'allow', rules: [] }),
      input('github', 'list_repos'),
      '00000000-0000-7000-8000-000000000001',
    );
    const confirm = evaluateRules(
      rules({ rules: [{ effect: 'require_confirmation', tools: ['*'] }] }),
      input('github', 'list_repos'),
      '00000000-0000-7000-8000-000000000002',
    );
    const r = mergeResults([allow, confirm]);
    expect(r.decision).toBe('REQUIRE_CONFIRMATION');
  });

  it('DENY beats REQUIRE_CONFIRMATION', () => {
    const confirm = evaluateRules(
      rules({ rules: [{ effect: 'require_confirmation', tools: ['*'] }] }),
      input('github', 'list_repos'),
      '00000000-0000-7000-8000-000000000001',
    );
    const deny = evaluateRules(
      rules({ rules: [{ effect: 'deny', tools: ['github.*'] }] }),
      input('github', 'list_repos'),
      '00000000-0000-7000-8000-000000000002',
    );
    const r = mergeResults([confirm, deny]);
    expect(r.decision).toBe('DENY');
  });
});
