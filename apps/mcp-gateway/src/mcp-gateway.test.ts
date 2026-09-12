/**
 * MCP Gateway — unit tests (no real HTTP, no real API).
 * Tests protocol logic, auth extraction, dispatch, and SI invariants.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerMcpRoutes } from './handler.js';
import * as authModule from '@arcane/auth';
import * as gatewayModule from './gateway-client.js';
import type { McpConfig } from '@arcane/config';

// ── Test config ───────────────────────────────────────────────────────────────

const TEST_CONFIG: McpConfig = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://localhost/test',
  DATABASE_POOL_MIN: 1,
  DATABASE_POOL_MAX: 5,
  VALKEY_URL: 'redis://localhost:6379',
  NATS_URL: 'nats://localhost:4222',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'test',
  S3_ACCESS_KEY: 'test',
  S3_SECRET_KEY: 'test',
  S3_REGION: 'us-east-1',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  SECRET_BACKEND: 'local',
  SECRET_ENCRYPTION_KEY: 'a'.repeat(64),
  OTEL_SERVICE_NAME: 'test-mcp',
  PORT: 3002,
  HOST: '0.0.0.0',
  JWT_SECRET: 'test-jwt-secret-min-32-chars-long!!',
  EXECUTION_GATEWAY_URL: 'http://api:3001',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(registerMcpRoutes, { config: TEST_CONFIG });
  return app;
}

function makeRpc(method: string, params?: Record<string, unknown>, id: string | number = 1) {
  return { jsonrpc: '2.0', method, id, ...(params ? { params } : {}) };
}

const VALID_TOKEN = 'valid.session.token';
const AUTH = { Authorization: `Bearer ${VALID_TOKEN}` };

function mockVerify() {
  vi.spyOn(authModule, 'verifySessionToken').mockReturnValue({
    sub: 'sess-uuid' as never,
    env: 'env-uuid' as never,
    iat: 0,
    exp: 9999999999,
    iss: 'arcane',
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('MCP auth', () => {
  it('returns 401 when no Bearer token', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      payload: makeRpc('ping'),
    });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error.code).toBe(-32001); // MCP_UNAUTHORIZED
  });

  it('returns 401 when token is invalid', async () => {
    vi.spyOn(authModule, 'verifySessionToken').mockImplementation(() => {
      throw new Error('bad token');
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('ping'),
    });
    expect(res.statusCode).toBe(401);
  });

  it('proceeds when token is valid', async () => {
    mockVerify();
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('ping'),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result).toEqual({});
  });
});

// ── initialize ────────────────────────────────────────────────────────────────

describe('initialize', () => {
  it('returns protocol version and server info', async () => {
    mockVerify();
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result.protocolVersion).toBe('2024-11-05');
    expect(body.result.serverInfo.name).toBe('arcane-mcp-gateway');
    expect(body.result.capabilities.tools).toBeDefined();
  });
});

// ── ping ──────────────────────────────────────────────────────────────────────

describe('ping', () => {
  it('returns empty result', async () => {
    mockVerify();
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('ping'),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().result).toEqual({});
  });

  it('echoes the request id', async () => {
    mockVerify();
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('ping', undefined, 'req-42'),
    });
    expect(res.json().id).toBe('req-42');
  });
});

// ── tools/list ────────────────────────────────────────────────────────────────

describe('tools/list', () => {
  it('delegates to gateway and returns MCP tool format', async () => {
    mockVerify();
    vi.spyOn(gatewayModule.GatewayClient.prototype, 'listTools').mockResolvedValue({
      tools: [
        {
          id: 'tid',
          slug: 'list_issues',
          toolkit_id: 'kid',
          toolkit_slug: 'github',
          name: 'List Issues',
          description: 'List GitHub issues', // SI-05: returned as data
          risk_level: ['READ_ONLY'],
          read_only: true,
          destructive: false,
          idempotent: true,
          latest_version: {
            id: 'vid',
            version: 1,
            input_schema: {
              type: 'object',
              properties: { owner: { type: 'string' } },
              required: ['owner'],
            },
            output_schema: {},
          },
        },
      ],
      next_cursor: null,
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('tools/list'),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result.tools).toHaveLength(1);
    const tool = body.result.tools[0];
    expect(tool.name).toBe('github/list_issues'); // "toolkit/tool" format
    expect(tool.description).toBe('List GitHub issues');
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.required).toContain('owner');
  });

  it('passes cursor to gateway', async () => {
    mockVerify();
    const spy = vi.spyOn(gatewayModule.GatewayClient.prototype, 'listTools').mockResolvedValue({
      tools: [],
      next_cursor: null,
    });
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('tools/list', { cursor: 'tok-abc' }),
    });
    expect(spy).toHaveBeenCalledWith('tok-abc');
  });

  it('propagates nextCursor when present', async () => {
    mockVerify();
    vi.spyOn(gatewayModule.GatewayClient.prototype, 'listTools').mockResolvedValue({
      tools: [],
      next_cursor: 'cursor-xyz',
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('tools/list'),
    });
    expect(res.json().result.nextCursor).toBe('cursor-xyz');
  });

  it('returns 502 when gateway fails', async () => {
    mockVerify();
    vi.spyOn(gatewayModule.GatewayClient.prototype, 'listTools').mockRejectedValue(
      new Error('network error'),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('tools/list'),
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toBeDefined();
  });
});

// ── tools/call ────────────────────────────────────────────────────────────────

describe('tools/call', () => {
  it('submits execution and returns result', async () => {
    mockVerify();
    vi.spyOn(gatewayModule.GatewayClient.prototype, 'submitExecution').mockResolvedValue('exec-1');
    vi.spyOn(gatewayModule.GatewayClient.prototype, 'pollExecution').mockResolvedValue({
      execution_id: 'exec-1',
      status: 'SUCCEEDED',
      output: { issues: [] },
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('tools/call', { name: 'github/list_issues', arguments: { owner: 'acme', repo: 'app' } }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.result.content).toHaveLength(1);
    expect(body.result.content[0].type).toBe('text');
    expect(body.result.isError).toBeFalsy();
  });

  it('returns isError:true on FAILED execution', async () => {
    mockVerify();
    vi.spyOn(gatewayModule.GatewayClient.prototype, 'submitExecution').mockResolvedValue('exec-2');
    vi.spyOn(gatewayModule.GatewayClient.prototype, 'pollExecution').mockResolvedValue({
      execution_id: 'exec-2',
      status: 'FAILED',
      error: { code: 'PROVIDER_ERROR', message: 'Rate limited' },
    });

    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('tools/call', { name: 'github/list_issues', arguments: {} }),
    });

    expect(res.statusCode).toBe(200); // JSON-RPC errors still 200
    const body = res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain('Rate limited');
  });

  it('returns 400 when tool name missing', async () => {
    mockVerify();
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('tools/call', { arguments: {} }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe(-32602); // RPC_INVALID_PARAMS
  });

  it('returns 400 when tool name has wrong format', async () => {
    mockVerify();
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('tools/call', { name: 'invalid-no-slash' }),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe(-32002); // MCP_TOOL_NOT_FOUND
  });

  it('returns 401 when gateway returns 401 (SI-09)', async () => {
    mockVerify();
    vi.spyOn(gatewayModule.GatewayClient.prototype, 'submitExecution').mockRejectedValue(
      new gatewayModule.GatewayError('Unauthorized', 401),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('tools/call', { name: 'github/list_issues', arguments: {} }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when policy denies (SI-04 via gateway)', async () => {
    mockVerify();
    vi.spyOn(gatewayModule.GatewayClient.prototype, 'submitExecution').mockRejectedValue(
      new gatewayModule.GatewayError('Forbidden by policy', 403),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('tools/call', { name: 'github/list_issues', arguments: {} }),
    });
    expect(res.statusCode).toBe(403);
  });

  it('SI-09: never resolves credentials — submitExecution receives only session token', async () => {
    mockVerify();
    const spy = vi.spyOn(gatewayModule.GatewayClient.prototype, 'submitExecution').mockResolvedValue('x');
    vi.spyOn(gatewayModule.GatewayClient.prototype, 'pollExecution').mockResolvedValue({
      execution_id: 'x',
      status: 'SUCCEEDED',
      output: 'ok',
    });

    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('tools/call', { name: 'github/list_issues', arguments: { owner: 'a', repo: 'b' } }),
    });

    // submitExecution should NOT receive any credential fields
    const callArgs = spy.mock.calls[0]?.[0];
    expect(callArgs).not.toHaveProperty('credential');
    expect(callArgs).not.toHaveProperty('access_token');
    expect(callArgs).not.toHaveProperty('secret');
  });
});

// ── unknown method ────────────────────────────────────────────────────────────

describe('unknown method', () => {
  it('returns METHOD_NOT_FOUND', async () => {
    mockVerify();
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: AUTH,
      payload: makeRpc('unknown/method'),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe(-32601); // RPC_METHOD_NOT_FOUND
  });
});

// ── health ────────────────────────────────────────────────────────────────────

describe('GET /mcp/health', () => {
  it('returns ok without auth', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/mcp/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    expect(res.json().gateway).toBe('http://api:3001');
  });
});
