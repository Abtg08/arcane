/**
 * Policy engine schemas.
 * Policy is a first-class authorization system — not a connector option.
 */

import { z } from 'zod';
import { UUIDv7Schema, DateTimeSchema } from '../common.js';

// ─── Policy Decision ──────────────────────────────────────────────────────────

export const PolicyDecisionSchema = z.enum(['ALLOW', 'DENY', 'REQUIRE_CONFIRMATION']);
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

// ─── Policy Rule ──────────────────────────────────────────────────────────────

export const PolicyRuleEffectSchema = z.enum(['allow', 'deny', 'require_confirmation']);
export type PolicyRuleEffect = z.infer<typeof PolicyRuleEffectSchema>;

export const PolicyRuleSchema = z.object({
  effect: PolicyRuleEffectSchema,
  // Tool patterns — supports exact match and wildcards e.g. "github.*"
  tools: z.array(z.string()).optional(),
  // Toolkit-level applies to all tools in toolkit
  toolkits: z.array(z.string()).optional(),
  // Condition — future: parameter-level constraints
  condition: z.record(z.unknown()).optional(),
  reason: z.string().optional(), // Human-readable explanation
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PolicyRulesSchema = z.object({
  version: z.literal('1'),
  rules: z.array(PolicyRuleSchema),
  default_effect: PolicyRuleEffectSchema.default('deny'), // deny by default
});
export type PolicyRules = z.infer<typeof PolicyRulesSchema>;

// ─── Policy ───────────────────────────────────────────────────────────────────

export const PolicyStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'DISABLED']);
export type PolicyStatus = z.infer<typeof PolicyStatusSchema>;

export const PolicySchema = z.object({
  id: UUIDv7Schema,
  environment_id: UUIDv7Schema,
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable(),
  version: z.number().int().positive(),
  status: PolicyStatusSchema,
  rules: PolicyRulesSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type Policy = z.infer<typeof PolicySchema>;

export const CreatePolicySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  rules: PolicyRulesSchema,
});
export type CreatePolicy = z.infer<typeof CreatePolicySchema>;

// ─── Policy Evaluation Context ────────────────────────────────────────────────

export const PolicyEvalContextSchema = z.object({
  session_id: UUIDv7Schema,
  external_user_id: UUIDv7Schema,
  environment_id: UUIDv7Schema,
  tool_slug: z.string(), // e.g. "github.create_issue"
  toolkit_slug: z.string(), // e.g. "github"
  connection_id: UUIDv7Schema,
  input: z.record(z.unknown()), // Tool input for parameter-level checks
});
export type PolicyEvalContext = z.infer<typeof PolicyEvalContextSchema>;

export const PolicyEvalResultSchema = z.object({
  decision: PolicyDecisionSchema,
  matched_rule: PolicyRuleSchema.nullable(),
  reason: z.string().nullable(),
  evaluated_policies: z.array(UUIDv7Schema),
});
export type PolicyEvalResult = z.infer<typeof PolicyEvalResultSchema>;
