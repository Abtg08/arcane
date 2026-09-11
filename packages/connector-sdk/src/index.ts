/**
 * @arcane/connector-sdk — Types and utilities for building connectors.
 * Connector authors import from here, not from internal Arcane packages.
 */

// ── Tool definition types ─────────────────────────────────────────────────────

export interface ToolParameter {
  name: string;
  in: 'path' | 'query' | 'body';
  required: boolean;
  type: 'string' | 'integer' | 'boolean' | 'number' | 'array' | 'object';
  description?: string | undefined;
  enum?: string[] | undefined;
  default?: unknown;
  minimum?: number | undefined;
  maximum?: number | undefined;
  items?: { type: string } | undefined;
}

export interface ToolHttpDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body_schema?: Record<string, unknown> | undefined;
}

export type RiskLevel =
  | 'READ_ONLY'
  | 'WRITE'
  | 'DESTRUCTIVE'
  | 'AUTHENTICATION'
  | 'EXTERNAL_COMMUNICATION'
  | 'FINANCIAL';

export interface ToolDef {
  slug: string;
  name: string;
  description: string;
  risk_level: RiskLevel[];
  read_only: boolean;
  destructive: boolean;
  idempotent: boolean;
  http: ToolHttpDef;
  parameters: ToolParameter[];
}

// ── Connector definition ──────────────────────────────────────────────────────

export interface OAuth2AuthDef {
  type: 'oauth2';
  oauth2: {
    authorization_url: string;
    token_url: string;
    scopes: string[];
    pkce: boolean;
    refresh_supported: boolean;
  };
  connect_hint?: string | undefined;
}

export type AuthDef = OAuth2AuthDef; // Extend as needed

export interface ConnectorDef {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  category: string;
  base_url: string;
  default_headers?: Record<string, string> | undefined;
  auth: AuthDef;
  tools: ToolDef[];
}

// ── Execution context (passed to tool handlers by connector-runtime) ──────────

export interface ExecutionContext {
  /** Resolved credential — never log this */
  credential: {
    type: string;
    [key: string]: unknown;
  };
  /** Tool input parameters, already validated against input_schema */
  input: Record<string, unknown>;
  /** Tracing */
  request_id: string;
  trace_id: string;
}

// ── Connector class interface ─────────────────────────────────────────────────

export interface ConnectorMeta {
  def: ConnectorDef;
}
