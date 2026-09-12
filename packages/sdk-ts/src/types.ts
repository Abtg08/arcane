/**
 * Shared types used across the Arcane SDK.
 * Kept simple — no dependency on @arcane/schemas to keep the SDK self-contained.
 */

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PageResult<T> {
  data: T[];
  next_cursor: string | null;
}

// ── Toolkits & Tools ──────────────────────────────────────────────────────────

export interface Toolkit {
  id: string;
  slug: string;
  name: string;
  description: string;
  provider: string;
  status: 'ACTIVE' | 'DEPRECATED';
  created_at: string;
}

export interface Tool {
  id: string;
  toolkit_id: string;
  slug: string;
  name: string;
  description: string;
  action_type: string;
  status: 'ACTIVE' | 'DEPRECATED';
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  created_at: string;
  /** Published version metadata */
  latest_version?: {
    tool_version_id: string;
    version: number;
    published_at: string;
  };
}

// ── Connections ───────────────────────────────────────────────────────────────

export interface Connection {
  id: string;
  toolkit_id: string;
  external_user_id: string;
  status: 'ACTIVE' | 'PENDING' | 'REVOKED' | 'ERROR';
  created_at: string;
  updated_at: string;
}

// ── Executions ────────────────────────────────────────────────────────────────

export type ExecutionStatus =
  | 'PENDING'
  | 'AUTHORIZING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REJECTED'
  | 'TIMED_OUT';

export interface Execution {
  id: string;
  tool_version_id: string;
  connection_id: string;
  environment_id: string;
  status: ExecutionStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ExecuteRequest {
  /** Fully-qualified tool identifier: "<toolkit_slug>.<tool_slug>" */
  tool: string;
  /** Connection ID to use for this execution */
  connection_id: string;
  /** Tool input matching the tool's input_schema */
  input: Record<string, unknown>;
}

export interface ExecuteResult {
  execution_id: string;
  status: ExecutionStatus;
}

// ── Triggers ──────────────────────────────────────────────────────────────────

export type TriggerStatus = 'ACTIVE' | 'PAUSED' | 'DELETED';

export interface Trigger {
  id: string;
  environment_id: string;
  slug: string;
  name: string;
  description: string | null;
  status: TriggerStatus;
  provider: string;
  configuration: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateTriggerRequest {
  slug: string;
  name: string;
  description?: string;
  provider: string;
  configuration?: Record<string, unknown>;
}

export interface Subscription {
  id: string;
  trigger_id: string;
  destination_id: string;
  external_user_id: string;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED';
  created_at: string;
}

export interface WebhookDestination {
  id: string;
  environment_id: string;
  name: string;
  url: string;
  status: 'ACTIVE' | 'DELETED';
  created_at: string;
}

export interface CreateDestinationRequest {
  name: string;
  url: string;
  /** Signing secret (write-only — never returned by the API) */
  signing_secret?: string;
}

// ── Client options ────────────────────────────────────────────────────────────

export interface ArcaneClientOptions {
  /** API key — required */
  apiKey: string;
  /** Base URL of the Arcane API. Defaults to https://api.arcane.run */
  baseUrl?: string;
  /**
   * Environment ID to use for all requests.
   * Overrides the environment tied to the API key when provided.
   */
  environmentId?: string;
  /** Request timeout in ms. Default 30000. */
  timeoutMs?: number;
}

export interface WaitForExecutionOptions {
  /** How long to poll before giving up. Default 120_000ms (2 min). */
  timeoutMs?: number;
  /** Poll interval. Default 1000ms. */
  intervalMs?: number;
}
