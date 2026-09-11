/**
 * @arcane/policy — Policy evaluation engine.
 *
 * Public API:
 *   evaluatePolicy(db, input) — load policies from DB and evaluate
 *   evaluateRules(rules, input, policyId) — pure evaluator (no DB)
 *   mergeResults(results) — merge multiple policy results
 */

export { evaluatePolicy } from './engine.js';
export type { PolicyEngineInput } from './engine.js';

export { evaluateRules, mergeResults } from './evaluator.js';
export type { EvalInput } from './evaluator.js';

export { loadActivePolicies } from './repository.js';
