/**
 * MCP Streamable HTTP request handler.
 *
 * Implements the MCP Streamable HTTP transport:
 * - POST /mcp  — JSON-RPC request/response (or SSE stream for tools/call)
 * - GET  /mcp  — SSE endpoint for server-initiated messages (optional, v2)
 *
 * All requests must carry a valid Arcane session Bearer token.
 * Execution is ALWAYS delegated to the Execution Gateway (SI-09).
 *
 * SI-01: Bearer token forwarded as-is — no credentials ever in this process.
 * SI-05: Tool names/descriptions are untrusted data — returned as data only.
 * SI-09: MCP gateway never resolves credentials or calls providers directly.
 */

import type { FastifyInstance } from 'fastify';
import { verifySessionToken } from '@arcane/auth';
import type { McpConfig } from '@arcane/config';
import { GatewayClient, GatewayError } from './gateway-client.js';
import {
  METHOD_INITIALIZE,
  METHOD_TOOLS_LIST,
  METHOD_TOOLS_CALL,
  METHOD_PING,
  RPC_PARSE_ERROR,
  RPC_INVALID_REQUEST,
  RPC_METHOD_NOT_FOUND,
  RPC_INVALID_PARAMS,
  RPC_INTERNAL_ERROR,
  MCP_UNAUTHORIZED,
  MCP_TOOL_NOT_FOUND,
  MCP_EXECUTION_FAILED,
  MCP_TIMEOUT,
  rpcOk,
  rpcError,
  sseMessage,
  type JsonRpcRequest,
  type InitializeResult,
  type ToolsListResult,
  type McpToolDef,
  type ToolsCallResult,
} from './mcp-types.js';

// MCP protocol version this gateway implements
const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'arcane-mcp-gateway';
const SERVER_VERSION = '1.0.0';

interface HandlerContext {
  config: McpConfig;
}

export async function registerMcpRoutes(
  fastify: FastifyInstance,
  opts: HandlerContext,
): Promise<void> {
  const { config } = opts;

  // ── POST /mcp — main Streamable HTTP endpoint ─────────────────────────────

  fastify.post(
    '/mcp',
    {
      schema: {},
    },
    async (req, reply) => {
      // ── Auth: extract + verify Bearer token ───────────────────────────────
      const authHeader = req.headers['authorization'] ?? '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

      if (!token) {
        const body = rpcError(null, MCP_UNAUTHORIZED, 'Missing Bearer token');
        return reply.status(401).send(body);
      }

      let sessionId: string;
      let environmentId: string;
      try {
        const payload = verifySessionToken(token, config.JWT_SECRET);
        sessionId = payload.sub;
        environmentId = payload.env;
      } catch {
        const body = rpcError(null, MCP_UNAUTHORIZED, 'Invalid or expired session token');
        return reply.status(401).send(body);
      }

      // Suppress unused-var warning — environmentId is contextual for future use
      void environmentId;

      // ── Parse JSON-RPC body ───────────────────────────────────────────────
      let rpc: JsonRpcRequest;
      try {
        rpc = req.body as JsonRpcRequest;
        if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
          return reply.status(400).send(rpcError(null, RPC_INVALID_REQUEST, 'Invalid JSON-RPC 2.0 request'));
        }
      } catch {
        return reply.status(400).send(rpcError(null, RPC_PARSE_ERROR, 'Parse error'));
      }

      const client = new GatewayClient({
        baseUrl: config.EXECUTION_GATEWAY_URL,
        sessionToken: token, // SI-01: forwarded as-is
      });

      // ── Dispatch ──────────────────────────────────────────────────────────

      // initialize
      if (rpc.method === METHOD_INITIALIZE) {
        const result: InitializeResult = {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        };
        return reply.send(rpcOk(rpc.id, result));
      }

      // ping
      if (rpc.method === METHOD_PING) {
        return reply.send(rpcOk(rpc.id, {}));
      }

      // tools/list
      if (rpc.method === METHOD_TOOLS_LIST) {
        const cursor = (rpc.params?.['cursor'] as string | undefined) ?? undefined;
        try {
          const { tools: gatewayTools, next_cursor } = await client.listTools(cursor);
          const tools: McpToolDef[] = gatewayTools.map(toMcpToolDef);
          const result: ToolsListResult = {
            tools,
            ...(next_cursor ? { nextCursor: next_cursor } : {}),
          };
          return reply.send(rpcOk(rpc.id, result));
        } catch (err) {
          fastify.log.error({ err, sessionId }, 'tools/list failed');
          return reply.status(502).send(rpcError(rpc.id, RPC_INTERNAL_ERROR, 'Failed to list tools'));
        }
      }

      // tools/call
      if (rpc.method === METHOD_TOOLS_CALL) {
        const name = rpc.params?.['name'];
        const args = (rpc.params?.['arguments'] ?? {}) as Record<string, unknown>;

        if (typeof name !== 'string' || !name) {
          return reply.status(400).send(rpcError(rpc.id, RPC_INVALID_PARAMS, 'Missing tool name'));
        }

        // Resolve "toolkit/tool" → slugs
        const resolved = await client.resolveToolName(name);
        if (!resolved) {
          return reply
            .status(400)
            .send(rpcError(rpc.id, MCP_TOOL_NOT_FOUND, `Tool not found: ${name}`));
        }

        const wantsStream =
          (req.headers['accept'] ?? '').includes('text/event-stream');

        let executionId: string;
        try {
          executionId = await client.submitExecution({
            toolkitSlug: resolved.toolkitSlug,
            toolSlug: resolved.toolSlug,
            arguments: args,
          });
        } catch (err) {
          if (err instanceof GatewayError) {
            if (err.httpStatus === 401) {
              return reply.status(401).send(rpcError(rpc.id, MCP_UNAUTHORIZED, 'Unauthorized'));
            }
            if (err.httpStatus === 403) {
              return reply
                .status(403)
                .send(rpcError(rpc.id, MCP_EXECUTION_FAILED, 'Forbidden by policy'));
            }
          }
          fastify.log.error({ err, name, sessionId }, 'tools/call submit failed');
          return reply
            .status(502)
            .send(rpcError(rpc.id, MCP_EXECUTION_FAILED, 'Execution submission failed'));
        }

        // ── Streaming response (SSE) ───────────────────────────────────────
        if (wantsStream) {
          reply.raw.setHeader('Content-Type', 'text/event-stream');
          reply.raw.setHeader('Cache-Control', 'no-cache');
          reply.raw.setHeader('Connection', 'keep-alive');
          reply.raw.flushHeaders();

          // Send a progress notification so the client knows we started
          const progressNote = {
            jsonrpc: '2.0' as const,
            method: 'notifications/progress',
            params: { progressToken: rpc.id, progress: 0, total: 1 },
          };
          reply.raw.write(sseMessage(progressNote));

          try {
            const pollOpts: { maxWaitMs: number; signal?: AbortSignal } = { maxWaitMs: 25_000 };
            if (req.raw.destroyed) {
              const ac = new AbortController();
              ac.abort();
              pollOpts.signal = ac.signal;
            }
            const result = await client.pollExecution(executionId, pollOpts);

            const mcpResult = executionResultToMcp(result);
            reply.raw.write(sseMessage(rpcOk(rpc.id, mcpResult)));
          } catch (err) {
            const code =
              err instanceof GatewayError && err.httpStatus === 504
                ? MCP_TIMEOUT
                : MCP_EXECUTION_FAILED;
            const msg = err instanceof Error ? err.message : 'Execution failed';
            reply.raw.write(sseMessage(rpcError(rpc.id, code, msg)));
          } finally {
            reply.raw.end();
          }
          return;
        }

        // ── Synchronous (polling, then reply) ─────────────────────────────
        try {
          const result = await client.pollExecution(executionId, { maxWaitMs: 25_000 });
          const mcpResult = executionResultToMcp(result);
          return reply.send(rpcOk(rpc.id, mcpResult));
        } catch (err) {
          const code =
            err instanceof GatewayError && err.httpStatus === 504
              ? MCP_TIMEOUT
              : MCP_EXECUTION_FAILED;
          const msg = err instanceof Error ? err.message : 'Execution failed';
          return reply.status(200).send(rpcError(rpc.id, code, msg));
        }
      }

      // Unknown method
      return reply
        .status(400)
        .send(rpcError(rpc.id, RPC_METHOD_NOT_FOUND, `Unknown method: ${rpc.method}`));
    },
  );

  // ── GET /mcp/health ───────────────────────────────────────────────────────

  fastify.get('/mcp/health', async (_req, reply) => {
    return reply.send({ status: 'ok', gateway: config.EXECUTION_GATEWAY_URL });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMcpToolDef(t: {
  slug: string;
  toolkit_slug: string;
  name: string;
  description: string; // SI-05: untrusted — returned as data, never eval'd
  latest_version?: { input_schema?: Record<string, unknown> };
}): McpToolDef {
  const schema = t.latest_version?.input_schema ?? {};
  return {
    name: `${t.toolkit_slug}/${t.slug}`,
    description: t.description, // SI-05: passed through as data
    inputSchema: {
      type: 'object',
      properties: (schema['properties'] as Record<string, unknown>) ?? {},
      ...((schema['required'] as string[] | undefined)?.length
        ? { required: schema['required'] as string[] }
        : {}),
    },
  };
}

function executionResultToMcp(result: {
  status: string;
  output?: unknown;
  error?: { code: string; message: string };
}): ToolsCallResult {
  if (result.status === 'SUCCEEDED' && result.output !== undefined) {
    const text =
      typeof result.output === 'string'
        ? result.output
        : JSON.stringify(result.output, null, 2);
    return { content: [{ type: 'text', text }] };
  }

  // FAILED or TIMED_OUT
  const msg =
    result.error?.message ?? (result.status === 'TIMED_OUT' ? 'Execution timed out' : 'Execution failed');
  return { content: [{ type: 'text', text: msg }], isError: true };
}
