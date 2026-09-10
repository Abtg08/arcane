/**
 * Tool search schemas.
 */

import { z } from 'zod';
import { UUIDv7Schema, PaginationSchema } from '../common.js';
import { ToolRiskLevelSchema } from '../connector/index.js';

export const ToolSearchRequestSchema = PaginationSchema.extend({
  q: z.string().min(1).max(500),
  toolkit: z.string().optional(),
  category: z.string().optional(),
  risk_level: ToolRiskLevelSchema.optional(),
  connected_only: z.boolean().default(false),
  session_id: UUIDv7Schema.optional(),
});
export type ToolSearchRequest = z.infer<typeof ToolSearchRequestSchema>;

export const ToolSearchResultSchema = z.object({
  tool_id: UUIDv7Schema,
  toolkit_id: UUIDv7Schema,
  toolkit_slug: z.string(),
  tool_slug: z.string(),
  name: z.string(),
  description: z.string(), // Untrusted — never treated as instructions
  risk_level: z.array(ToolRiskLevelSchema),
  read_only: z.boolean(),
  destructive: z.boolean(),
  is_connected: z.boolean(),
  connection_id: UUIDv7Schema.nullable(),
  score: z.number(), // Relevance score
});
export type ToolSearchResult = z.infer<typeof ToolSearchResultSchema>;
