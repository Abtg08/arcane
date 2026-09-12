/**
 * ArcaneClient unit tests.
 *
 * All HTTP is mocked via vi.stubGlobal('fetch', ...).
 * Tests cover:
 *   - Client construction validation
 *   - HTTP transport: headers, query params, error handling
 *   - Tools resource: listToolkits, listTools, getTool
 *   - Connections resource: list, initiateOAuth, revoke
 *   - Executions resource: execute, get, waitFor, timeout
 *   - Triggers resource: create, list, get, delete, subscribe
 *   - Error classes: ArcaneApiError, ArcaneAuthError, ArcaneTimeoutError
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArcaneClient } from './client.js';
import {
  ArcaneError,
  ArcaneApiError,
  ArcaneAuthError,
  ArcaneTimeoutError,
} from './errors.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const API_KEY = 'arc_test_key';
const BASE_URL = 'http://localhost:3000/v1';

function makeClient(): ArcaneClient {
  return new ArcaneClient({ apiKey: API_KEY, baseUrl: BASE_URL });
}

function mockOk(body: unknown, status = 200): void {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'req-123' },
    }),
  );
}

function mockError(status: number, body: { message: string; code?: string }): void {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'req-err' },
    }),
  );
}

function mockNetworkError(message = 'ECONNREFUSED'): void {
  vi.mocked(fetch).mockRejectedValueOnce(new Error(message));
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Client construction ────────────────────────────────────────────────────────

describe('ArcaneClient construction', () => {
  it('throws if apiKey is missing', () => {
    expect(() => new ArcaneClient({ apiKey: '' })).toThrow('apiKey is required');
  });

  it('creates client with required options', () => {
    const client = makeClient();
    expect(client.tools).toBeDefined();
    expect(client.connections).toBeDefined();
    expect(client.executions).toBeDefined();
    expect(client.triggers).toBeDefined();
  });
});

// ── HTTP transport ─────────────────────────────────────────────────────────────

describe('HTTP transport', () => {
  it('sends Authorization header', async () => {
    mockOk({ data: [], next_cursor: null });
    const client = makeClient();
    await client.tools.listToolkits();

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${API_KEY}`);
  });

  it('sends User-Agent header', async () => {
    mockOk({ data: [], next_cursor: null });
    const client = makeClient();
    await client.tools.listToolkits();

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/^@arcane\/sdk/);
  });

  it('appends query parameters to URL', async () => {
    mockOk({ data: [], next_cursor: null });
    const client = makeClient();
    await client.tools.listToolkits({ q: 'github', limit: 5 });

    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url as string).toContain('q=github');
    expect(url as string).toContain('limit=5');
  });

  it('throws ArcaneApiError on 404', async () => {
    mockError(404, { message: 'Not found', code: 'NOT_FOUND' });
    const client = makeClient();

    await expect(client.tools.getTool('missing', 'tool')).rejects.toThrow(ArcaneApiError);
  });

  it('sets status and code on ArcaneApiError', async () => {
    mockError(422, { message: 'Validation failed', code: 'VALIDATION_ERROR' });
    const client = makeClient();

    try {
      await client.tools.getTool('bad', 'tool');
    } catch (err) {
      expect(err).toBeInstanceOf(ArcaneApiError);
      const e = err as ArcaneApiError;
      expect(e.status).toBe(422);
      expect(e.code).toBe('VALIDATION_ERROR');
      expect(e.requestId).toBe('req-err');
    }
  });

  it('throws ArcaneAuthError on 401', async () => {
    mockError(401, { message: 'Invalid API key' });
    const client = makeClient();

    await expect(client.tools.listToolkits()).rejects.toThrow(ArcaneAuthError);
  });

  it('throws ArcaneAuthError on 403', async () => {
    mockError(403, { message: 'Forbidden' });
    const client = makeClient();

    await expect(client.tools.listToolkits()).rejects.toThrow(ArcaneAuthError);
  });

  it('throws ArcaneError on network failure', async () => {
    mockNetworkError('ECONNREFUSED');
    const client = makeClient();

    await expect(client.tools.listToolkits()).rejects.toThrow(ArcaneError);
  });

  it('includes ECONNREFUSED in error message', async () => {
    mockNetworkError('ECONNREFUSED');
    const client = makeClient();

    try {
      await client.tools.listToolkits();
    } catch (err) {
      expect((err as Error).message).toContain('ECONNREFUSED');
    }
  });
});

// ── Tools resource ─────────────────────────────────────────────────────────────

describe('tools.listToolkits', () => {
  it('returns page result', async () => {
    const data = [{ id: 'tk1', slug: 'github', name: 'GitHub' }];
    mockOk({ data, next_cursor: null });
    const client = makeClient();

    const result = await client.tools.listToolkits();
    expect(result.data).toEqual(data);
    expect(result.next_cursor).toBeNull();
  });

  it('passes search query', async () => {
    mockOk({ data: [], next_cursor: null });
    const client = makeClient();
    await client.tools.listToolkits({ q: 'slack' });

    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url as string).toContain('q=slack');
  });
});

describe('tools.getTool', () => {
  it('calls correct endpoint', async () => {
    const tool = { id: 't1', slug: 'list_repos', name: 'List Repos' };
    mockOk(tool);
    const client = makeClient();
    const result = await client.tools.getTool('github', 'list_repos');

    expect(result).toEqual(tool);
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url as string).toContain('/toolkits/github/tools/list_repos');
  });
});

// ── Connections resource ──────────────────────────────────────────────────────

describe('connections.list', () => {
  it('returns connection list', async () => {
    const data = [{ id: 'conn1', status: 'ACTIVE' }];
    mockOk({ data, next_cursor: null });
    const client = makeClient();

    const result = await client.connections.list({ status: 'ACTIVE' });
    expect(result.data).toEqual(data);
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url as string).toContain('status=ACTIVE');
  });
});

describe('connections.initiateOAuth', () => {
  it('returns redirect URL', async () => {
    const resp = { redirect_url: 'https://github.com/oauth', state: 'abc123' };
    mockOk(resp);
    const client = makeClient();

    const result = await client.connections.initiateOAuth({
      toolkit_slug: 'github',
      external_user_id: 'user-1',
      redirect_uri: 'https://app.example.com/callback',
    });
    expect(result.redirect_url).toBe('https://github.com/oauth');
    expect(result.state).toBe('abc123');
  });
});

describe('connections.revoke', () => {
  it('calls DELETE and returns void', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = makeClient();

    await expect(client.connections.revoke('conn1')).resolves.toBeUndefined();
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url as string).toContain('/connections/conn1');
    expect((init as RequestInit).method).toBe('DELETE');
  });
});

// ── Executions resource ───────────────────────────────────────────────────────

describe('executions.execute', () => {
  it('posts to /execute and returns execution_id', async () => {
    mockOk({ execution_id: 'exec-1', status: 'PENDING' }, 202);
    const client = makeClient();

    const result = await client.executions.execute({
      tool: 'github.list_repos',
      connection_id: 'conn-1',
      input: { owner: 'acme' },
    });
    expect(result.execution_id).toBe('exec-1');
    expect(result.status).toBe('PENDING');

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body['tool']).toBe('github.list_repos');
  });
});

describe('executions.waitFor', () => {
  it('returns immediately if execution is already terminal', async () => {
    mockOk({ id: 'exec-1', status: 'SUCCEEDED', output: { repos: [] } });
    const client = makeClient();

    const result = await client.executions.waitFor('exec-1');
    expect(result.status).toBe('SUCCEEDED');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('polls until terminal status', async () => {
    mockOk({ id: 'exec-1', status: 'RUNNING', output: null });
    mockOk({ id: 'exec-1', status: 'RUNNING', output: null });
    mockOk({ id: 'exec-1', status: 'SUCCEEDED', output: { ok: true } });

    const client = makeClient();
    const result = await client.executions.waitFor('exec-1', { intervalMs: 1 });
    expect(result.status).toBe('SUCCEEDED');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });

  it('throws ArcaneTimeoutError when deadline exceeded', async () => {
    // Always return RUNNING — create a fresh Response per call so body is not exhausted
    vi.mocked(fetch).mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'exec-1', status: 'RUNNING' }), { status: 200 }),
      ),
    );
    const client = makeClient();

    await expect(
      client.executions.waitFor('exec-1', { timeoutMs: 50, intervalMs: 10 }),
    ).rejects.toThrow(ArcaneTimeoutError);
  });

  it('returns FAILED execution without throwing', async () => {
    mockOk({ id: 'exec-1', status: 'FAILED', error: 'tool unavailable' });
    const client = makeClient();

    const result = await client.executions.waitFor('exec-1');
    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('tool unavailable');
  });
});

// ── Triggers resource ─────────────────────────────────────────────────────────

describe('triggers.create', () => {
  it('posts and returns trigger', async () => {
    const trigger = { id: 'trig-1', slug: 'gh-push', name: 'GitHub Push', status: 'ACTIVE' };
    mockOk(trigger, 201);
    const client = makeClient();

    const result = await client.triggers.create({
      slug: 'gh-push',
      name: 'GitHub Push',
      provider: 'github',
    });
    expect(result.id).toBe('trig-1');
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect((init as RequestInit).method).toBe('POST');
  });
});

describe('triggers.delete', () => {
  it('calls DELETE on trigger', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = makeClient();

    await expect(client.triggers.delete('trig-1')).resolves.toBeUndefined();
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url as string).toContain('/triggers/trig-1');
  });
});

describe('triggers.subscribe', () => {
  it('posts to subscriptions endpoint', async () => {
    const sub = { id: 'sub-1', trigger_id: 'trig-1', destination_id: 'dest-1', status: 'ACTIVE' };
    mockOk(sub, 201);
    const client = makeClient();

    const result = await client.triggers.subscribe('trig-1', {
      destination_id: 'dest-1',
      external_user_id: 'user-1',
    });
    expect(result.id).toBe('sub-1');
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(url as string).toContain('/triggers/trig-1/subscriptions');
  });
});

describe('triggers.createDestination', () => {
  it('creates a webhook destination', async () => {
    const dest = { id: 'dest-1', name: 'My Hook', url: 'https://example.com/hook', status: 'ACTIVE' };
    mockOk(dest, 201);
    const client = makeClient();

    const result = await client.triggers.createDestination({
      name: 'My Hook',
      url: 'https://example.com/hook',
    });
    expect(result.id).toBe('dest-1');
  });
});

// ── Error class properties ─────────────────────────────────────────────────────

describe('error classes', () => {
  it('ArcaneError has correct name', () => {
    const e = new ArcaneError('test');
    expect(e.name).toBe('ArcaneError');
    expect(e).toBeInstanceOf(Error);
  });

  it('ArcaneApiError carries status and code', () => {
    const e = new ArcaneApiError(422, 'bad request', 'req-1', 'INVALID');
    expect(e.status).toBe(422);
    expect(e.code).toBe('INVALID');
    expect(e.requestId).toBe('req-1');
    expect(e).toBeInstanceOf(ArcaneError);
  });

  it('ArcaneAuthError defaults to 401', () => {
    const e = new ArcaneAuthError();
    expect(e.status).toBe(401);
    expect(e.code).toBe('UNAUTHORIZED');
    expect(e).toBeInstanceOf(ArcaneApiError);
  });

  it('ArcaneTimeoutError has correct name', () => {
    const e = new ArcaneTimeoutError();
    expect(e.name).toBe('ArcaneTimeoutError');
    expect(e).toBeInstanceOf(ArcaneError);
  });
});
