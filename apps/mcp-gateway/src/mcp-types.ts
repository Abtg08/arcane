/**
 * MCP (Model Context Protocol) Streamable HTTP wire types.
 *
 * Ref: https://spec.modelcontextprotocol.io/specification/basic/transports/
 * We implement the Streamable HTTP transport (2024-11-05+).
 *
 * All tool metadata is UNTRUSTED (SI-05) — returned as data, never eval'd.
 */

// ── JSON-RPC 2.0 base ─────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: T;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// ── JSON-RPC error codes ──────────────────────────────────────────────────────

export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;
// MCP-specific codes (application range: -32000 to -32099)
export const MCP_UNAUTHORIZED = -32001;
export const MCP_TOOL_NOT_FOUND = -32002;
export const MCP_EXECUTION_FAILED = -32003;
export const MCP_TIMEOUT = -32004;

// ── MCP method names ──────────────────────────────────────────────────────────

export const METHOD_INITIALIZE = 'initialize';
export const METHOD_TOOLS_LIST = 'tools/list';
export const METHOD_TOOLS_CALL = 'tools/call';
export const METHOD_PING = 'ping';
export const METHOD_NOTIFICATIONS_CANCELLED = 'notifications/cancelled';

// ── initialize ────────────────────────────────────────────────────────────────

export interface InitializeParams {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: { name: string; version: string };
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: {
    tools: { listChanged?: boolean };
  };
  serverInfo: { name: string; version: string };
}

// ── tools/list ────────────────────────────────────────────────────────────────

export interface ToolsListParams {
  cursor?: string;
}

export interface McpToolDef {
  name: string; // "toolkit/tool" slug — e.g. "github/list_issues"
  description: string; // SI-05: untrusted, returned as data only
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolsListResult {
  tools: McpToolDef[];
  nextCursor?: string;
}

// ── tools/call ────────────────────────────────────────────────────────────────

export interface ToolsCallParams {
  name: string; // "toolkit/tool" format
  arguments?: Record<string, unknown>;
}

export interface McpContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface ToolsCallResult {
  content: McpContent[];
  isError?: boolean;
}

// ── SSE event helpers ─────────────────────────────────────────────────────────

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function sseMessage(msg: JsonRpcResponse | JsonRpcNotification): string {
  return `data: ${JSON.stringify(msg)}\n\n`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function rpcOk<T>(id: string | number | null, result: T): JsonRpcResponse<T> {
  return { jsonrpc: '2.0', id, result };
}

export function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}
