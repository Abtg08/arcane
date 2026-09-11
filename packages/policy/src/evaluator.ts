/**
 * Pure policy rule evaluator — no DB, no side effects.
 *
 * Rules are evaluated in order. First match wins.
 * If no rule matches, default_effect is used.
 *
 * Tool matching supports:
 *   - Exact:    "github.list_repos"
 *   - Wildcard: "github.*"   (all tools in toolkit)
 *   - Global:   "*"          (all tools)
 *
 * Toolkit matching (toolkits field):
 *   - Matches all tools whose toolkit_slug equals the entry
 *
 * SI-04: Policy evaluator is deterministic and has no network calls.
 *        It can never be slow-pathed past.
 */

import type { PolicyRules, PolicyEvalResult } from '@arcane/schemas';

export interface EvalInput {
  tool_slug: string;    // e.g. "list_repos"
  toolkit_slug: string; // e.g. "github"
  /** Full dot-notation slug passed to matchers: "github.list_repos" */
  full_slug: string;
}

/**
 * Evaluate a set of policy rules against an execution request.
 * Pure function — given the same inputs always returns the same output.
 */
export function evaluateRules(
  rules: PolicyRules,
  input: EvalInput,
  policyId: string,
): PolicyEvalResult {
  for (const rule of rules.rules) {
    if (ruleMatches(rule, input)) {
      return {
        decision: effectToDecision(rule.effect),
        matched_rule: rule,
        reason: rule.reason ?? null,
        evaluated_policies: [policyId as import('@arcane/schemas').UUIDv7],
      };
    }
  }

  // No rule matched — apply default
  return {
    decision: effectToDecision(rules.default_effect),
    matched_rule: null,
    reason: `No rule matched; default_effect='${rules.default_effect}'`,
    evaluated_policies: [policyId as import('@arcane/schemas').UUIDv7],
  };
}

/**
 * Merge results from multiple policies.
 * DENY always wins. REQUIRE_CONFIRMATION beats ALLOW.
 */
export function mergeResults(results: PolicyEvalResult[]): PolicyEvalResult {
  if (results.length === 0) {
    // No policies active — implicit ALLOW (fail-open for dev, overridden by prod policies)
    return {
      decision: 'ALLOW',
      matched_rule: null,
      reason: 'No active policies — implicit allow',
      evaluated_policies: [],
    };
  }

  const allPolicies = results.flatMap((r) => r.evaluated_policies);

  // DENY wins over everything
  const deny = results.find((r) => r.decision === 'DENY');
  if (deny) {
    return { ...deny, evaluated_policies: allPolicies };
  }

  // REQUIRE_CONFIRMATION beats ALLOW
  const confirm = results.find((r) => r.decision === 'REQUIRE_CONFIRMATION');
  if (confirm) {
    return { ...confirm, evaluated_policies: allPolicies };
  }

  // All ALLOW
  return { ...results[0]!, evaluated_policies: allPolicies };
}

// ── Internals ─────────────────────────────────────────────────────────────────

function ruleMatches(
  rule: PolicyRules['rules'][number],
  input: EvalInput,
): boolean {
  const toolMatch = matchesToolList(rule.tools, input);
  const toolkitMatch = matchesToolkitList(rule.toolkits, input);

  // If both lists are absent, the rule matches everything (global rule)
  if (!rule.tools && !rule.toolkits) return true;

  // If only one list is specified, only check that one
  if (rule.tools && !rule.toolkits) return toolMatch;
  if (!rule.tools && rule.toolkits) return toolkitMatch;

  // Both specified — either match is sufficient
  return toolMatch || toolkitMatch;
}

function matchesToolList(
  tools: string[] | undefined,
  input: EvalInput,
): boolean {
  if (!tools || tools.length === 0) return false;
  return tools.some((pattern) => matchPattern(pattern, input));
}

function matchesToolkitList(
  toolkits: string[] | undefined,
  input: EvalInput,
): boolean {
  if (!toolkits || toolkits.length === 0) return false;
  return toolkits.some((tk) => tk === input.toolkit_slug || tk === '*');
}

/**
 * Pattern matching for tool slugs.
 * Supported patterns:
 *   "*"              — all tools
 *   "github.*"       — all github tools
 *   "github.list_repos" — exact match
 */
function matchPattern(pattern: string, input: EvalInput): boolean {
  if (pattern === '*') return true;

  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2); // strip ".*"
    return input.toolkit_slug === prefix;
  }

  // Exact match against full slug
  return pattern === input.full_slug;
}

function effectToDecision(
  effect: 'allow' | 'deny' | 'require_confirmation',
): PolicyEvalResult['decision'] {
  switch (effect) {
    case 'allow': return 'ALLOW';
    case 'deny': return 'DENY';
    case 'require_confirmation': return 'REQUIRE_CONFIRMATION';
  }
}
