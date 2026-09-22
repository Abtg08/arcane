import type {
  Connection,
  Execution,
  ExecStatus,
  RiskLevel,
  Tool,
  Toolkit,
  Trigger,
} from "./types";

/**
 * Deterministic mock dataset. No Math.random / Date.now at module scope —
 * everything derives from a fixed seed so SSR and client render identically.
 */
const BASE_TS = Date.parse("2026-09-22T09:00:00.000Z");

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOOLKITS: Toolkit[] = [
  {
    slug: "github",
    name: "GitHub",
    icon: "🐙",
    category: "Developer",
    tool_count: 6,
    status: "ACTIVE",
    description: "Repositories, issues, pull requests and workflow runs.",
  },
  {
    slug: "slack",
    name: "Slack",
    icon: "💬",
    category: "Communication",
    tool_count: 5,
    status: "ACTIVE",
    description: "Channels, messages and user lookups.",
  },
  {
    slug: "gmail",
    name: "Gmail",
    icon: "✉️",
    category: "Communication",
    tool_count: 5,
    status: "ACTIVE",
    description: "Threads, drafts and message delivery.",
  },
  {
    slug: "notion",
    name: "Notion",
    icon: "📓",
    category: "Productivity",
    tool_count: 4,
    status: "ACTIVE",
    description: "Pages, databases and block operations.",
  },
  {
    slug: "linear",
    name: "Linear",
    icon: "📐",
    category: "Productivity",
    tool_count: 4,
    status: "ACTIVE",
    description: "Issues, cycles and project tracking.",
  },
  {
    slug: "stripe",
    name: "Stripe",
    icon: "💳",
    category: "Payments",
    tool_count: 5,
    status: "ACTIVE",
    description: "Customers, invoices, refunds and payouts.",
  },
  {
    slug: "postgres",
    name: "Postgres",
    icon: "🐘",
    category: "Data",
    tool_count: 4,
    status: "INACTIVE",
    description: "Parameterised SQL reads and writes.",
  },
  {
    slug: "s3",
    name: "Amazon S3",
    icon: "🪣",
    category: "Storage",
    tool_count: 4,
    status: "ACTIVE",
    description: "Object listing, upload and lifecycle control.",
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    icon: "🧲",
    category: "CRM",
    tool_count: 4,
    status: "INACTIVE",
    description: "Contacts, deals and pipeline automation.",
  },
];

const TOOLS: Record<string, [string, string, RiskLevel][]> = {
  github: [
    ["list_repositories", "List repositories visible to the connected account.", "READ_ONLY"],
    ["get_issue", "Fetch a single issue with comments and labels.", "READ_ONLY"],
    ["create_issue", "Open a new issue in a repository.", "WRITE"],
    ["comment_on_pr", "Post a review comment on a pull request.", "WRITE"],
    ["merge_pull_request", "Merge a pull request into its base branch.", "WRITE"],
    ["delete_branch", "Permanently delete a remote branch.", "DESTRUCTIVE"],
  ],
  slack: [
    ["list_channels", "List channels in the workspace.", "READ_ONLY"],
    ["get_thread", "Read a message thread with replies.", "READ_ONLY"],
    ["send_message", "Post a message to a channel or user.", "WRITE"],
    ["upload_file", "Upload a file to a channel.", "WRITE"],
    ["delete_message", "Remove a message permanently.", "DESTRUCTIVE"],
  ],
  gmail: [
    ["list_threads", "List threads matching a query.", "READ_ONLY"],
    ["get_message", "Fetch a message with headers and body.", "READ_ONLY"],
    ["create_draft", "Create a draft email.", "WRITE"],
    ["send_email", "Send an email from the connected mailbox.", "WRITE"],
    ["trash_thread", "Move an entire thread to trash.", "DESTRUCTIVE"],
  ],
  notion: [
    ["search_pages", "Full-text search across the workspace.", "READ_ONLY"],
    ["get_page", "Read a page and its block tree.", "READ_ONLY"],
    ["append_blocks", "Append content blocks to a page.", "WRITE"],
    ["archive_page", "Archive a page and its children.", "DESTRUCTIVE"],
  ],
  linear: [
    ["list_issues", "List issues in a team or project.", "READ_ONLY"],
    ["get_issue", "Fetch one issue with its history.", "READ_ONLY"],
    ["create_issue", "Create an issue in a team.", "WRITE"],
    ["update_issue_state", "Move an issue to another workflow state.", "WRITE"],
  ],
  stripe: [
    ["list_customers", "List customers with filters.", "READ_ONLY"],
    ["get_invoice", "Fetch an invoice and its line items.", "READ_ONLY"],
    ["create_payment_link", "Generate a hosted payment link.", "WRITE"],
    ["issue_refund", "Refund a charge in full or part.", "WRITE"],
    ["delete_customer", "Permanently delete a customer record.", "DESTRUCTIVE"],
  ],
  postgres: [
    ["describe_schema", "Introspect tables, columns and indexes.", "READ_ONLY"],
    ["run_select", "Run a parameterised SELECT query.", "READ_ONLY"],
    ["run_insert", "Insert rows into a table.", "WRITE"],
    ["truncate_table", "Remove every row from a table.", "DESTRUCTIVE"],
  ],
  s3: [
    ["list_objects", "List objects under a prefix.", "READ_ONLY"],
    ["get_object_metadata", "Read object size, type and tags.", "READ_ONLY"],
    ["put_object", "Upload or overwrite an object.", "WRITE"],
    ["delete_object", "Permanently delete an object.", "DESTRUCTIVE"],
  ],
  hubspot: [
    ["list_contacts", "List CRM contacts.", "READ_ONLY"],
    ["get_deal", "Fetch a deal with associations.", "READ_ONLY"],
    ["create_contact", "Create a new contact record.", "WRITE"],
    ["delete_deal", "Permanently delete a deal.", "DESTRUCTIVE"],
  ],
};

export function getToolkits(): Toolkit[] {
  return TOOLKITS;
}

export function getTools(slug: string): Tool[] {
  const raw = TOOLS[slug];
  if (!raw) return [];
  return raw.map(([name, description, risk_level]) => ({
    slug: name,
    name,
    toolkit_slug: slug,
    description,
    risk_level,
  }));
}

const ACCOUNTS = [
  "acme-eng@arcane.dev",
  "ops-bot@acme.io",
  "growth@northwind.co",
  "platform@acme.io",
  "billing@northwind.co",
  "data-team@acme.io",
  "support@vertex.app",
];

const TENANTS = ["acme", "northwind", "vertex", "orbital"];

let connectionsCache: Connection[] | null = null;
export function getConnections(): Connection[] {
  if (connectionsCache) return connectionsCache;
  const rand = mulberry(7717);
  connectionsCache = TOOLKITS.filter((_, i) => i !== 8).map((tk, i) => ({
    id: `conn_${(1000 + i * 137).toString(36)}${Math.floor(rand() * 9999)
      .toString(36)
      .padStart(3, "0")}`,
    toolkit_slug: tk.slug,
    toolkit_name: tk.name,
    toolkit_icon: tk.icon,
    account_label: ACCOUNTS[i % ACCOUNTS.length]!,
    status: tk.status === "INACTIVE" ? "INACTIVE" : i === 4 ? "PAUSED" : "ACTIVE",
    created_at: new Date(BASE_TS - (i + 2) * 86400000 * 3).toISOString(),
  }));
  return connectionsCache!;
}

const EXEC_STATUSES: ExecStatus[] = [
  "SUCCESS",
  "SUCCESS",
  "SUCCESS",
  "SUCCESS",
  "SUCCESS",
  "FAILED",
  "RUNNING",
  "PENDING",
];

function sampleInput(toolkit: string, tool: string, tenant: string) {
  const base: Record<string, unknown> = { tenant, idempotency_key: `idem_${tool}_${tenant}` };
  if (toolkit === "github") return { ...base, repository: "acme/platform", issue_number: 482 };
  if (toolkit === "slack") return { ...base, channel: "#alerts", text: "Deploy finished." };
  if (toolkit === "gmail")
    return { ...base, to: ["ops@acme.io"], subject: "Weekly digest", body_preview: "Here is…" };
  if (toolkit === "stripe") return { ...base, customer: "cus_QkZ13x", amount: 4900, currency: "usd" };
  if (toolkit === "postgres") return { ...base, sql: "select id, email from users limit 25" };
  if (toolkit === "s3") return { ...base, bucket: "arcane-artifacts", prefix: "exports/2026/09/" };
  if (toolkit === "linear") return { ...base, team: "ENG", issue: "ENG-1184" };
  return { ...base, query: "status:open", limit: 25 };
}

function sampleOutput(status: ExecStatus, toolkit: string) {
  if (status === "FAILED")
    return {
      error: { code: "upstream_rate_limited", message: `${toolkit} rejected the request`, retryable: true },
    };
  if (status === "RUNNING" || status === "PENDING") return null;
  return {
    ok: true,
    result: { id: `res_${toolkit}_8f21`, items: 12, truncated: false },
    usage: { api_calls: 2, cache_hit: true },
  };
}

let executionsCache: Execution[] | null = null;
export function getExecutions(): Execution[] {
  if (executionsCache) return executionsCache;
  const rand = mulberry(20260922);
  const rows: Execution[] = [];
  for (let i = 0; i < 64; i++) {
    const tk = TOOLKITS[Math.floor(rand() * TOOLKITS.length)]!;
    const tools = getTools(tk.slug);
    const tool = tools[Math.floor(rand() * tools.length)]!;
    const status = EXEC_STATUSES[Math.floor(rand() * EXEC_STATUSES.length)]!;
    const tenant = TENANTS[Math.floor(rand() * TENANTS.length)]!;
    const created = BASE_TS - i * 1_730_000 - Math.floor(rand() * 400_000);
    const duration = status === "PENDING" ? 0 : 40 + Math.floor(rand() * 4200);
    const id = `exec_${(created.toString(36) + i.toString(36)).slice(-10)}`;
    rows.push({
      id,
      toolkit_slug: tk.slug,
      toolkit_name: tk.name,
      tool_name: tool.name,
      status,
      duration_ms: duration,
      tenant,
      created_at: new Date(created).toISOString(),
      finished_at:
        status === "RUNNING" || status === "PENDING"
          ? null
          : new Date(created + duration).toISOString(),
      input: sampleInput(tk.slug, tool.name, tenant),
      output: sampleOutput(status, tk.slug),
      audit_trail: [
        { at: new Date(created).toISOString(), actor: "agent:orchestrator", event: "execution.queued", detail: `Tool ${tool.name} queued for ${tenant}` },
        { at: new Date(created + 120).toISOString(), actor: "arcane:gateway", event: "auth.resolved", detail: `Connection for ${tk.name} resolved` },
        { at: new Date(created + 260).toISOString(), actor: "arcane:policy", event: "policy.checked", detail: `Risk level ${tool.risk_level} permitted` },
        ...(status === "PENDING"
          ? []
          : [{ at: new Date(created + 340).toISOString(), actor: "arcane:runtime", event: "execution.started", detail: "Dispatched to upstream API" }]),
        ...(status === "SUCCESS"
          ? [{ at: new Date(created + duration).toISOString(), actor: "arcane:runtime", event: "execution.succeeded", detail: `Completed in ${duration}ms` }]
          : status === "FAILED"
            ? [{ at: new Date(created + duration).toISOString(), actor: "arcane:runtime", event: "execution.failed", detail: "Upstream returned 429" }]
            : []),
      ],
    });
  }
  executionsCache = rows;
  return rows;
}

const EVENTS = [
  "issue.opened",
  "message.posted",
  "invoice.paid",
  "object.created",
  "page.updated",
  "thread.received",
];

let triggersCache: Trigger[] | null = null;
export function getTriggers(): Trigger[] {
  if (triggersCache) return triggersCache;
  const rand = mulberry(31337);
  const built: Trigger[] = Array.from({ length: 9 }, (_, i) => {
    const tk = TOOLKITS[i % TOOLKITS.length]!;
    const event = EVENTS[i % EVENTS.length]!;
    const fired = i % 4 === 3 ? null : BASE_TS - (i + 1) * 3_600_000 - Math.floor(rand() * 500_000);
    return {
      id: `trg_${(4000 + i * 91).toString(36)}${i}`,
      name: `${tk.name} ${event.split(".")[1]} relay`,
      toolkit_slug: tk.slug,
      toolkit_name: tk.name,
      event_type: `${tk.slug}.${event}`,
      status: (i % 3 === 2 ? "PAUSED" : "ACTIVE") as Trigger["status"],
      last_fired_at: fired ? new Date(fired).toISOString() : null,
      created_at: new Date(BASE_TS - (i + 3) * 86400000 * 4).toISOString(),
    };
  });
  triggersCache = built;
  return built;
}

export function setTriggerStatus(id: string, status: Trigger["status"]) {
  const list = getTriggers();
  const t = list.find((x) => x.id === id);
  if (t) t.status = status;
  return t;
}
