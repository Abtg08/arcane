export type Status = "ACTIVE" | "INACTIVE" | "PAUSED";
export type ExecStatus = "SUCCESS" | "FAILED" | "RUNNING" | "PENDING";
export type RiskLevel = "READ_ONLY" | "WRITE" | "DESTRUCTIVE";

export interface Toolkit {
  slug: string;
  name: string;
  icon: string;
  category: string;
  tool_count: number;
  status: Status;
  description: string;
}

export interface Tool {
  slug: string;
  name: string;
  toolkit_slug: string;
  description: string;
  risk_level: RiskLevel;
}

export interface Connection {
  id: string;
  toolkit_slug: string;
  toolkit_name: string;
  toolkit_icon: string;
  account_label: string;
  status: Status;
  created_at: string;
}

export interface AuditEntry {
  at: string;
  actor: string;
  event: string;
  detail: string;
}

export interface Execution {
  id: string;
  toolkit_slug: string;
  toolkit_name: string;
  tool_name: string;
  status: ExecStatus;
  duration_ms: number;
  tenant: string;
  created_at: string;
  finished_at: string | null;
  input?: unknown;
  output?: unknown;
  audit_trail?: AuditEntry[];
}

export interface Trigger {
  id: string;
  name: string;
  toolkit_slug: string;
  toolkit_name: string;
  event_type: string;
  status: Status;
  last_fired_at: string | null;
  created_at: string;
}

export interface ListResponse<T> {
  data: T[];
  next_cursor?: string | null;
}
