/**
 * Dashboard API types — mirrors the backend response shapes.
 * No dependency on @arcane/sdk or @arcane/schemas: the dashboard
 * fetches from its own API proxy route and needs its own type layer.
 */

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
  status: ExecutionStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  execution_id: string;
  event_type: string;
  actor_type: string;
  actor_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Toolkit {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  provider: string;
  status: 'ACTIVE' | 'DEPRECATED';
  created_at: string;
}

export interface Tool {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  action_type: string;
  status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  latest_version?: { version: string };
}

export interface Connection {
  id: string;
  toolkit_id: string;
  status: 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'REVOKED';
  external_user_id: string;
  created_at: string;
  last_used_at: string | null;
}

export interface Trigger {
  id: string;
  slug: string;
  name: string;
  provider: string;
  description: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'DELETED';
  created_at: string;
}

export interface PageResult<T> {
  data: T[];
  next_cursor: string | null;
  total?: number;
}
