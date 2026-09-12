/**
 * Execution Gateway client — thin HTTP client that delegates to the API.
 *
 * SI-09: MCP gateway NEVER resolves credentials or calls providers.
 *        All execution is forwarded to the Execution Gateway (API service).
 * SI-01: We forward the session token; we never put credentials in requests.
 */

export interface GatewayTool {
  id: string;
  slug: string;
  name: string;
  description: string; // SI-05: untrusted
  toolkit_slug: string;
  toolkit_id: string;
  risk_level: string[];
  read_only: boolean;
  destructive: boolean;
  idempotent: boolean;
  latest_version: {
    id: string;
    version: number;
    input_schema: Record<string, unknown>;
    output_schema: Record<string, unknown>;
  };
}

export interface GatewayToolkit {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
}

export interface ExecuteResult {
  execution_id: string;
  status: 'PENDING' | 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT';
  output?: unknown;
  error?: { code: string; message: string };
}

export class GatewayClient {
  private readonly baseUrl: string;
  private readonly sessionToken: string;
  private readonly timeoutMs: number;

  constructor(opts: { baseUrl: string; sessionToken: string; timeoutMs?: number }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.sessionToken = opts.sessionToken;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      // SI-01: bearer token identifies the session, never contains credentials
      Authorization: `Bearer ${this.sessionToken}`,
    };
  }

  /** Fetch paginated tools from the API toolkit endpoints. */
  async listTools(cursor?: string): Promise<{ tools: GatewayTool[]; next_cursor: string | null }> {
    const qs = new URLSearchParams();
    if (cursor) qs.set('cursor', cursor);

    // First get toolkits
    const tkRes = await fetch(`${this.baseUrl}/toolkits?${qs}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!tkRes.ok) {
      throw new GatewayError(`Toolkit list failed: ${tkRes.status}`, tkRes.status);
    }

    const { data: toolkits, next_cursor } = (await tkRes.json()) as {
      data: GatewayToolkit[];
      next_cursor: string | null;
    };

    // For each toolkit fetch its tools (parallel, bounded)
    const toolArrays = await Promise.all(
      toolkits.map((tk) => this.listToolsForToolkit(tk.slug)),
    );

    const tools = toolArrays.flat();
    return { tools, next_cursor };
  }

  private async listToolsForToolkit(toolkitSlug: string): Promise<GatewayTool[]> {
    const res = await fetch(`${this.baseUrl}/toolkits/${toolkitSlug}/tools`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) return []; // Toolkit may have disappeared — tolerate gracefully
    const { data } = (await res.json()) as { data: GatewayTool[] };
    return (data ?? []).map((t) => ({ ...t, toolkit_slug: toolkitSlug }));
  }

  /**
   * Resolve a "toolkit/tool" MCP name to its API slugs.
   * Returns null if the tool is not found.
   */
  async resolveToolName(
    mcpName: string,
  ): Promise<{ toolkitSlug: string; toolSlug: string } | null> {
    const parts = mcpName.split('/');
    if (parts.length !== 2) return null;
    const [toolkitSlug, toolSlug] = parts as [string, string];
    return { toolkitSlug, toolSlug };
  }

  /**
   * Submit a tool execution to the API gateway.
   * Returns the execution_id immediately (async execution).
   *
   * SI-09: all execution goes through the API gateway.
   */
  async submitExecution(opts: {
    toolkitSlug: string;
    toolSlug: string;
    arguments: Record<string, unknown>;
    connectionId?: string;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      toolkit: opts.toolkitSlug,
      tool: opts.toolSlug,
      input: opts.arguments,
    };
    if (opts.connectionId) body['connection_id'] = opts.connectionId;

    const res = await fetch(`${this.baseUrl}/execute`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (res.status === 401) throw new GatewayError('Unauthorized', 401);
    if (res.status === 403) throw new GatewayError('Forbidden by policy', 403);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new GatewayError(`Execution submit failed: ${res.status} ${txt.slice(0, 200)}`, res.status);
    }

    const { execution_id } = (await res.json()) as { execution_id: string };
    return execution_id;
  }

  /**
   * Poll execution status until terminal or timeout.
   * Polls with exponential backoff: 100ms → 200ms → 400ms → 800ms → 1600ms (cap).
   */
  async pollExecution(
    executionId: string,
    opts: { maxWaitMs?: number; signal?: AbortSignal } = {},
  ): Promise<ExecuteResult> {
    const maxWait = opts.maxWaitMs ?? 25_000;
    const deadline = Date.now() + maxWait;
    let delay = 100;

    while (true) {
      if (opts.signal?.aborted) throw new GatewayError('Cancelled', 0);
      if (Date.now() > deadline) throw new GatewayError('Execution poll timeout', 504);

      const res = await fetch(`${this.baseUrl}/executions/${executionId}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) throw new GatewayError(`Poll failed: ${res.status}`, res.status);

      const data = (await res.json()) as ExecuteResult;
      const { status } = data;

      if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'TIMED_OUT') {
        return data;
      }

      // Not terminal — wait and retry
      await sleep(Math.min(delay, 1600));
      delay = Math.min(delay * 2, 1600);
    }
  }
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
