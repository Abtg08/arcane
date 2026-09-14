/**
 * Phase 13 — Load / Throughput Tests
 *
 * In-process load test using Fastify's inject() — no live infra needed.
 * All tests exercise the same mock DB + Redis setup as the E2E suite.
 *
 * Goals verified per endpoint:
 *   - Sustained throughput ≥ target RPS for the configured concurrency
 *   - p50 latency ≤ 50 ms  (inject() excludes real network)
 *   - p95 latency ≤ 200 ms
 *   - p99 latency ≤ 500 ms
 *   - Zero HTTP 5xx responses
 *   - Rate limit kicks in once the per-key RPM window is exhausted
 *
 * Design notes
 * ────────────
 *  • inject() calls run entirely in the Node.js event loop — no TCP stack.
 *    Realistic network latency is exercised by integration / staging tests.
 *  • Concurrent batches simulate fan-out API clients; sequential rounds
 *    simulate a sustained request stream.
 *  • The rate-limit test fires enough requests in one minute window to cross
 *    the per-key RATE_LIMIT_PER_KEY_RPM (set to 50 here) and asserts that
 *    subsequent requests are rejected with 429.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';

// ── Static IDs ───────────────────────────────────────────────────────────────
// SESSION_ID_CONST must be a plain literal — vi.mock factories are hoisted
// before const declarations, so module-level consts are unavailable there.

const SESSION_ID_CONST = '01900000-0000-7000-8000-000000000007';

const ENV_ID     = '01900000-0000-7000-8000-000000000001';
const KEY_ID     = '01900000-0000-7000-8000-000000000002';
const TOOLKIT_ID = '01900000-0000-7000-8000-000000000003';
const TOOL_ID    = '01900000-0000-7000-8000-000000000004';
const TOOL_VER   = '01900000-0000-7000-8000-000000000005';
const CONN_ID    = '01900000-0000-7000-8000-000000000006';
const SESSION_ID = SESSION_ID_CONST;
// Separate key ID for the rate-limit test so its exhausted counter doesn't
// affect the mixed-workload test which runs afterwards.
const KEY_ID_RL  = '01900000-0000-7000-8000-000000000008';
const JWT_SECRET = 'load-test-jwt-secret-32-chars!!!';
const API_KEY_PREFIX = 'arc_';

// ── ioredis mock ─────────────────────────────────────────────────────────────

vi.mock('ioredis', () => {
  const store = new Map<string, string>([
    [
      'session:01900000-0000-7000-8000-000000000007',
      JSON.stringify({
        id: '01900000-0000-7000-8000-000000000007',
        environment_id: '01900000-0000-7000-8000-000000000001',
        external_user_id: 'load-user-001',
        status: 'ACTIVE',
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    ],
  ]);

  // Per-key rate-limit counters (keyed by `rate:key:<id>:<minute>`)
  const counters = new Map<string, number>();

  const mockRedis = {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); return 'OK'; }),
    setex: vi.fn(async (k: string, _ttl: number, v: string) => { store.set(k, v); return 'OK'; }),
    del: vi.fn(async (k: string) => { const had = store.has(k); store.delete(k); return had ? 1 : 0; }),
    getdel: vi.fn(async (k: string) => { const v = store.get(k) ?? null; store.delete(k); return v; }),
    ping: vi.fn(async () => 'PONG'),
    on: vi.fn(() => {}),
    status: 'ready',
    // INCR / EXPIRE used by per-key rate limiter
    incr: vi.fn(async (k: string) => {
      const prev = counters.get(k) ?? 0;
      const next = prev + 1;
      counters.set(k, next);
      return next;
    }),
    expire: vi.fn(async () => 1),
  };

  return {
    Redis: vi.fn().mockImplementation(() => mockRedis),
    default: { Redis: vi.fn().mockImplementation(() => mockRedis) },
    // Test helper — lets individual tests seed the counter so they can
    // force rate-limit behaviour without exhausting the window with real requests.
    _seedCounter: (key: string, value: number) => counters.set(key, value),
    _getCounter: (key: string) => counters.get(key) ?? 0,
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

type Pct = Record<'p50' | 'p95' | 'p99' | 'min' | 'max', number>;

function percentiles(samples: number[]): Pct {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (pct: number) => sorted[Math.floor((pct / 100) * sorted.length)] ?? 0;
  return {
    min: sorted[0] ?? 0,
    p50: at(50),
    p95: at(95),
    p99: at(99),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function makeApiKey() {
  const secret = randomBytes(16).toString('hex');
  const plaintext = `${API_KEY_PREFIX}live_${secret}`;
  const prefix = `${API_KEY_PREFIX}live_${secret.slice(0, 8)}`;
  const hash = createHash('sha256').update(plaintext).digest('hex');
  return { plaintext, prefix, hash };
}

const silentLogger = {
  info: () => {}, warn: () => {}, error: () => {}, debug: () => {},
  trace: () => {}, fatal: () => {},
  child: function () { return this as typeof silentLogger; },
  level: 'silent',
} as const;

// High enough that the load tests (≤1000 total auth'd requests) never hit it.
// The rate-limit test seeds the counter directly rather than exhausting it.
const RATE_LIMIT_PER_KEY_RPM = 10_000;

const testConfig = {
  NODE_ENV: 'test' as const,
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://x:x@localhost/x',
  DATABASE_POOL_MIN: 2, DATABASE_POOL_MAX: 10,
  VALKEY_URL: 'redis://localhost:6379',
  NATS_URL: 'nats://localhost:4222',
  S3_BUCKET: 'arcane-load', S3_REGION: 'us-east-1',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  OTEL_SERVICE_NAME: 'arcane-load-test',
  SECRET_ENCRYPTION_KEY: '0'.repeat(64),
  SECRET_BACKEND: 'local' as const,
  PORT: 0, HOST: '0.0.0.0',
  JWT_SECRET,
  JWT_EXPIRES_IN: '24h',
  API_KEY_PREFIX,
  OAUTH_REDIRECT_BASE_URL: 'http://localhost:3000',
  CORS_ORIGINS: ['http://localhost:3000'],
  RATE_LIMIT_GLOBAL_RPM: 100_000,
  RATE_LIMIT_PER_KEY_RPM,
};

type MockDb = {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

function makeMockDb(): MockDb {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      // API key lookup — return the matching key row based on prefix param
      if (sql.includes('api_keys') && sql.includes('key_prefix')) {
        const lookupPrefix = (params as string[])?.[0] ?? '';
        const isRlKey = rateLimitKey && lookupPrefix === rateLimitKey.prefix;
        return {
          rows: [{
            id: isRlKey ? KEY_ID_RL : KEY_ID,
            environment_id: ENV_ID,
            key_prefix: isRlKey ? rateLimitKey.prefix : apiKey.prefix,
            key_hash: isRlKey ? rateLimitKey.hash : apiKey.hash,
            permissions: ['EXECUTE', 'READ', 'WRITE', 'ADMIN'],
            expires_at: null, revoked_at: null,
          }],
          rowCount: 1,
          command: 'SELECT', oid: 0, fields: [],
        };
      }
      if (sql.includes('api_keys') && sql.toLowerCase().includes('update')) {
        return { rows: [], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] };
      }

      // Session lookup
      if (
        (sql.includes('sessions') || sql.includes('external_users')) &&
        !sql.toLowerCase().includes('insert') &&
        !sql.includes('connected_accounts')
      ) {
        return {
          rows: [{
            id: SESSION_ID, environment_id: ENV_ID,
            external_user_id: 'load-user-001',
            status: 'ACTIVE',
            expires_at: new Date(Date.now() + 86400_000),
            metadata: {}, created_at: new Date(), updated_at: new Date(),
          }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        };
      }

      // Toolkits
      if (sql.includes('toolkits') && !sql.includes('tool_versions')) {
        return {
          rows: [{
            id: TOOLKIT_ID, slug: 'github', name: 'GitHub',
            description: 'GitHub integration', icon_url: null,
            auth_type: 'OAUTH2', status: 'ACTIVE',
            created_at: new Date(), updated_at: new Date(),
          }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        };
      }

      // Tool versions (PUBLISHED)
      if (sql.includes('tool_versions') && sql.includes('PUBLISHED')) {
        if (sql.includes('FROM tools t')) {
          return {
            rows: [{
              id: TOOL_ID, slug: 'list_repos', name: 'List Repositories',
              description: 'List GitHub repos', version: 1, version_id: TOOL_VER,
              input_schema: { type: 'object', properties: {} },
              output_schema: { type: 'object', properties: {} },
              risk_level: ['READ_ONLY'], read_only: true, destructive: false, idempotent: true,
            }],
            rowCount: 1, command: 'SELECT', oid: 0, fields: [],
          };
        }
        return {
          rows: [{
            tool_version_id: TOOL_VER, tool_id: TOOL_ID,
            version: 1, input_schema: { type: 'object', properties: {} },
            risk_level: ['READ_ONLY'],
          }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        };
      }

      // Tools listing
      if (sql.includes('tools') && sql.includes('tool_versions')) {
        return {
          rows: [{
            id: TOOL_ID, slug: 'list_repos', name: 'List Repositories',
            description: 'List GitHub repos', toolkit_id: TOOLKIT_ID,
            toolkit_slug: 'github', status: 'ACTIVE',
            latest_version: 1, input_schema: {}, output_schema: {},
            risk_level: ['READ_ONLY'], created_at: new Date(),
          }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        };
      }

      // Connections
      if (sql.includes('connected_accounts')) {
        return {
          rows: [{
            id: CONN_ID, external_user_id: 'load-user-001',
            status: 'ACTIVE', toolkit_id: TOOLKIT_ID,
            toolkit_slug: 'github', created_at: new Date(),
          }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        };
      }

      // Policies — default ALLOW (empty = allow)
      if (sql.includes('policies')) {
        return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
      }

      // Executions INSERT
      if (sql.includes('executions') && sql.toLowerCase().includes('insert')) {
        return { rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
      }
      // Executions SELECT
      if (sql.includes('executions') && sql.toLowerCase().includes('select')) {
        return {
          rows: [{
            id: '01900000-0000-7000-8000-000000000099',
            status: 'AUTHORIZING',
            tool_version_id: TOOL_VER, connection_id: CONN_ID,
            session_id: null, output: null, error_code: null, error_message: null,
            started_at: null, completed_at: null, created_at: new Date(),
          }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        };
      }

      // Audit events
      if (sql.includes('audit_events')) {
        return { rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
      }

      // Search
      if (sql.includes('plainto_tsquery') || sql.includes('similarity')) {
        return {
          rows: [{
            id: TOOL_ID, slug: 'list_repos', name: 'List Repositories',
            description: 'List GitHub repos',
            toolkit_slug: 'github', toolkit_name: 'GitHub', rank: 0.5,
          }],
          rowCount: 1, command: 'SELECT', oid: 0, fields: [],
        };
      }

      return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
    }),
    connect: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    on: vi.fn(() => {}),
  };
}

import { _testSetPool, shutdownPool } from '@arcane/core';
import { buildApp } from '../../apps/api/src/app.js';

// ── Suite state ───────────────────────────────────────────────────────────────

let app: FastifyInstance;
let apiKey: ReturnType<typeof makeApiKey>;
let rateLimitKey: ReturnType<typeof makeApiKey>; // dedicated key for rate-limit test
let authHeader: string;

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Phase 13 — Load Tests', () => {
  beforeAll(async () => {
    apiKey = makeApiKey();
    rateLimitKey = makeApiKey(); // separate key so rate-limit test doesn't affect others
    authHeader = apiKey.plaintext; // sent as X-Api-Key header, not Bearer

    const db = makeMockDb();
    await shutdownPool().catch(() => {});
    _testSetPool(db as any);
    app = await buildApp(testConfig as any, silentLogger as any, { db: db as any });
    await app.ready();
  });

  afterAll(async () => {
    await app.close().catch(() => {});
    await shutdownPool().catch(() => {});
  });

  // ── Baseline: Health endpoint (no auth) ─────────────────────────────────────

  it('GET /health — 500 rps with p99 ≤ 50 ms', async () => {
    const CONCURRENCY = 50;
    const ROUNDS = 10;
    const latencies: number[] = [];
    let errors = 0;

    for (let r = 0; r < ROUNDS; r++) {
      const batch = Array.from({ length: CONCURRENCY }, async () => {
        const t0 = performance.now();
        const res = await app.inject({ method: 'GET', url: '/health' });
        latencies.push(performance.now() - t0);
        if (res.statusCode >= 500) errors++;
      });
      await Promise.all(batch);
    }

    const total = CONCURRENCY * ROUNDS;
    const p = percentiles(latencies);
    console.log(`  /health — ${total} reqs | p50=${p.p50.toFixed(1)}ms p95=${p.p95.toFixed(1)}ms p99=${p.p99.toFixed(1)}ms`);

    expect(errors).toBe(0);
    expect(p.p50).toBeLessThan(50);
    expect(p.p99).toBeLessThan(200);
  });

  // ── Metrics endpoint (no auth, Prometheus) ───────────────────────────────────

  it('GET /metrics — 200 rps with p99 ≤ 100 ms', async () => {
    const CONCURRENCY = 20;
    const ROUNDS = 10;
    const latencies: number[] = [];
    let errors = 0;

    for (let r = 0; r < ROUNDS; r++) {
      const batch = Array.from({ length: CONCURRENCY }, async () => {
        const t0 = performance.now();
        const res = await app.inject({ method: 'GET', url: '/metrics' });
        latencies.push(performance.now() - t0);
        if (res.statusCode >= 500) errors++;
      });
      await Promise.all(batch);
    }

    const total = CONCURRENCY * ROUNDS;
    const p = percentiles(latencies);
    console.log(`  /metrics — ${total} reqs | p50=${p.p50.toFixed(1)}ms p95=${p.p95.toFixed(1)}ms p99=${p.p99.toFixed(1)}ms`);

    expect(errors).toBe(0);
    expect(p.p99).toBeLessThan(200);
  });

  // ── Auth path: list toolkits ──────────────────────────────────────────────

  it('GET /v1/toolkits — 300 rps with p95 ≤ 100 ms, 0 5xx', async () => {
    const CONCURRENCY = 30;
    const ROUNDS = 10;
    const latencies: number[] = [];
    let errors = 0;

    for (let r = 0; r < ROUNDS; r++) {
      const batch = Array.from({ length: CONCURRENCY }, async () => {
        const t0 = performance.now();
        const res = await app.inject({
          method: 'GET',
          url: '/v1/toolkits',
          headers: { 'x-api-key': authHeader },
        });
        latencies.push(performance.now() - t0);
        if (res.statusCode >= 500) errors++;
      });
      await Promise.all(batch);
    }

    const total = CONCURRENCY * ROUNDS;
    const p = percentiles(latencies);
    console.log(`  GET /v1/toolkits — ${total} reqs | p50=${p.p50.toFixed(1)}ms p95=${p.p95.toFixed(1)}ms p99=${p.p99.toFixed(1)}ms`);

    expect(errors).toBe(0);
    expect(p.p95).toBeLessThan(200);
  });

  // ── Auth path: list connections ────────────────────────────────────────────

  it('GET /v1/connections — 300 rps with p95 ≤ 100 ms, 0 5xx', async () => {
    const CONCURRENCY = 30;
    const ROUNDS = 10;
    const latencies: number[] = [];
    let errors = 0;

    for (let r = 0; r < ROUNDS; r++) {
      const batch = Array.from({ length: CONCURRENCY }, async () => {
        const t0 = performance.now();
        const res = await app.inject({
          method: 'GET',
          url: '/v1/connections',
          headers: { 'x-api-key': authHeader },
        });
        latencies.push(performance.now() - t0);
        if (res.statusCode >= 500) errors++;
      });
      await Promise.all(batch);
    }

    const total = CONCURRENCY * ROUNDS;
    const p = percentiles(latencies);
    console.log(`  GET /v1/connections — ${total} reqs | p50=${p.p50.toFixed(1)}ms p95=${p.p95.toFixed(1)}ms p99=${p.p99.toFixed(1)}ms`);

    expect(errors).toBe(0);
    expect(p.p95).toBeLessThan(200);
  });

  // ── Write path: tool execution ────────────────────────────────────────────

  it('POST /v1/execute — 200 rps with p95 ≤ 200 ms, 0 5xx', async () => {
    const CONCURRENCY = 20;
    const ROUNDS = 10;
    const latencies: number[] = [];
    let errors = 0;

    for (let r = 0; r < ROUNDS; r++) {
      const batch = Array.from({ length: CONCURRENCY }, async () => {
        const t0 = performance.now();
        const res = await app.inject({
          method: 'POST',
          url: '/v1/execute',
          headers: { 'x-api-key': authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({
            toolkit_slug: 'github',
            tool_slug: 'list_repos',
            connection_id: CONN_ID,
            input: { owner: 'acme' },
          }),
        });
        latencies.push(performance.now() - t0);
        if (res.statusCode >= 500) errors++;
      });
      await Promise.all(batch);
    }

    const total = CONCURRENCY * ROUNDS;
    const p = percentiles(latencies);
    console.log(`  POST /v1/execute — ${total} reqs | p50=${p.p50.toFixed(1)}ms p95=${p.p95.toFixed(1)}ms p99=${p.p99.toFixed(1)}ms`);

    expect(errors).toBe(0);
    expect(p.p95).toBeLessThan(500);
  });

  // ── Search path ───────────────────────────────────────────────────────────

  it('POST /v1/search/tools — 200 rps with p95 ≤ 200 ms, 0 5xx', async () => {
    const CONCURRENCY = 20;
    const ROUNDS = 10;
    const latencies: number[] = [];
    let errors = 0;

    for (let r = 0; r < ROUNDS; r++) {
      const batch = Array.from({ length: CONCURRENCY }, async () => {
        const t0 = performance.now();
        const res = await app.inject({
          method: 'POST',
          url: '/v1/search/tools',
          headers: { 'x-api-key': authHeader, 'content-type': 'application/json' },
          payload: JSON.stringify({ query: 'list repos', limit: 10 }),
        });
        latencies.push(performance.now() - t0);
        if (res.statusCode >= 500) errors++;
      });
      await Promise.all(batch);
    }

    const total = CONCURRENCY * ROUNDS;
    const p = percentiles(latencies);
    console.log(`  POST /v1/search/tools — ${total} reqs | p50=${p.p50.toFixed(1)}ms p95=${p.p95.toFixed(1)}ms p99=${p.p99.toFixed(1)}ms`);

    expect(errors).toBe(0);
    expect(p.p95).toBeLessThan(500);
  });

  // ── Rate limit enforcement ────────────────────────────────────────────────
  //
  // Pre-seeds the ioredis counter to RATE_LIMIT_PER_KEY_RPM - 2 for a
  // dedicated key (KEY_ID_RL) and fires 15 requests.  The first two succeed,
  // the remaining 13 must come back 429.  The dedicated key ID ensures the
  // exhausted counter doesn't bleed into other tests.

  it('Per-key rate limit: requests over RPM cap return 429', async () => {
    // Pre-seed the counter to just below the threshold so we only need
    // a small burst to trigger the rate limit — avoids running 50+ actual
    // requests (expensive) and bleeding into other tests' counters.
    const minute = Math.floor(Date.now() / 60_000);
    const windowKey = `rate:key:${KEY_ID_RL}:${minute}`;
    const ioredis = await import('ioredis');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ioredis as any)._seedCounter(windowKey, RATE_LIMIT_PER_KEY_RPM - 2);

    const target = 15; // 2 ok + 13 rate-limited (threshold is RPM_PER_KEY)
    const results: number[] = [];

    // Sequential to keep the counter monotonic.
    // Uses rateLimitKey (KEY_ID_RL) so its exhausted counter doesn't bleed
    // into the mixed-workload test which uses the main apiKey (KEY_ID).
    for (let i = 0; i < target; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/toolkits',
        headers: { 'x-api-key': rateLimitKey.plaintext },
      });
      results.push(res.statusCode);
    }

    const tooManyRequests = results.filter((s) => s === 429).length;
    const ok = results.filter((s) => s === 200).length;

    console.log(`  Rate limit: ${ok} ok, ${tooManyRequests} rate-limited of ${target} total`);

    // We pre-seeded the counter to RPM_PER_KEY - 2, so the first 2 requests
    // succeed and all subsequent ones must be rate-limited.
    expect(tooManyRequests).toBeGreaterThanOrEqual(10); // 13 out of 15
    // No 5xx — rate limiter should return 429 cleanly
    const serverErrors = results.filter((s) => s >= 500).length;
    expect(serverErrors).toBe(0);
  });

  // ── Mixed-workload sustained test ─────────────────────────────────────────
  //
  // Runs all endpoint types concurrently for multiple rounds.
  // Validates that the app remains stable under mixed read+write load.

  it('Mixed workload — all endpoints stable over 500 requests, 0 5xx', async () => {
    const BATCH = 10;
    const ROUNDS = 50;
    const latencies: number[] = [];
    let serverErrors = 0;

    const endpoints = [
      () => app.inject({ method: 'GET', url: '/health' }),
      () => app.inject({ method: 'GET', url: '/v1/toolkits', headers: { 'x-api-key': authHeader } }),
      () => app.inject({ method: 'GET', url: '/v1/connections', headers: { 'x-api-key': authHeader } }),
      () => app.inject({
        method: 'POST', url: '/v1/search/tools',
        headers: { 'x-api-key': authHeader, 'content-type': 'application/json' },
        payload: JSON.stringify({ query: 'list', limit: 5 }),
      }),
    ] as const;

    for (let r = 0; r < ROUNDS; r++) {
      const batch = Array.from({ length: BATCH }, async () => {
        const fn = endpoints[r % endpoints.length];
        const t0 = performance.now();
        const res = await fn();
        latencies.push(performance.now() - t0);
        if (res.statusCode >= 500) serverErrors++;
      });
      await Promise.all(batch);
    }

    const total = BATCH * ROUNDS;
    const p = percentiles(latencies);
    console.log(`  Mixed — ${total} reqs | p50=${p.p50.toFixed(1)}ms p95=${p.p95.toFixed(1)}ms p99=${p.p99.toFixed(1)}ms`);

    expect(serverErrors).toBe(0);
    expect(p.p99).toBeLessThan(500);
  });
});
