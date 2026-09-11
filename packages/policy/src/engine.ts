/**
 * Policy engine — the public entry point for policy evaluation.
 *
 * Combines repository (DB load) + evaluator (pure rule matching).
 *
 * SI-04: This is called BEFORE credential resolution in executions.ts.
 *        The caller is responsible for enforcing that order.
 */

import type { DbPool } from '@arcane/core';
import type { PolicyEvalResult } from '@arcane/schemas';
import { loadActivePolicies } from './repository.js';
import { evaluateRules, mergeResults, type EvalInput } from './evaluator.js';

export interface PolicyEngineInput {
  environment_id: string;
  tool_slug: string;
  toolkit_slug: string;
  connection_id: string;
  input: Record<string, unknown>;
  session_id?: string | undefined;
}

/**
 * Evaluate all active policies for an environment against an execution request.
 *
 * Returns a merged PolicyEvalResult:
 *   - ALLOW → caller may proceed to credential resolution
 *   - DENY → caller must reject immediately (never load credentials)
 *   - REQUIRE_CONFIRMATION → caller must pause and return 202
 *
 * Never throws — errors are caught and returned as DENY to avoid bypassing policy.
 */
export async function evaluatePolicy(
  db: DbPool,
  input: PolicyEngineInput,
): Promise<PolicyEvalResult> {
  try {
    const policies = await loadActivePolicies(db, input.environment_id);

    const evalInput: EvalInput = {
      tool_slug: input.tool_slug,
      toolkit_slug: input.toolkit_slug,
      full_slug: `${input.toolkit_slug}.${input.tool_slug}`,
    };

    const results = policies.map((policy) =>
      evaluateRules(policy.rules, evalInput, policy.id),
    );

    return mergeResults(results);
  } catch (err) {
    // Safety: if policy evaluation throws (e.g. DB error), fail closed with DENY
    console.error('[policy] Evaluation error — failing closed (DENY):', err);
    return {
      decision: 'DENY',
      matched_rule: null,
      reason: 'Policy evaluation error — execution denied for safety',
      evaluated_policies: [],
    };
  }
}
