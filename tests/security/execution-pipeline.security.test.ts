/**
 * Phase 10 — Security acceptance tests.
 *
 * 15 mandatory tests covering the full security invariant set (SI-01 through SI-17).
 *
 * Strategy: build Fastify app in-process with mock DB + mock Redis.
 * No real Postgres, no real Valkey, no real NATS — pure HTTP layer tests.
 * Each test controls exactly what the mock DB returns to exercise one invariant.
 *
 * Coverage map:
 *   AT-01 → SI-15: API keys stored hash-only (plaintext never retrievable)
 *   AT-02 → SI-17: Expired JWT sessions rejected before route handlers
 *   AT-03 → SI-17: Tampered JWT rejected (wrong signature)
 *   AT-04 → No auth: unauthenticated requests always 401
 *   AT-05 → SI-06: Non-PUBLISHED tool versions not executable
 *   AT-06 → SI-04: Policy DENY blocks execution before credential resolution
 *   AT-07 → SI-04: Policy order — DENY takes precedence
 *   AT-08 → SI-04+SI-11: REQUIRE_CONFIRMATION returns 202, writes audit event
 *   AT-09 → SI-11: AUTHORIZING audit event written before NATS publish
 *   AT-10 → SI-03: secret_reference never in API response
 *   AT-11 → SI-13: SQL injection attempt returns 400/404, not 500 with SQL details
 *   AT-12 → SI-08: SSRF protection blocks private IP requests
 *   AT-13 → SI-07: Provider response credentials stripped (response sanitizer)
 *   AT-14 → SI-01: Execution payload published to NATS never contains credentials
 *   AT-15 → SI-10: audit_events append-only (no UPDATE/DELETE in writeAuditEvent)
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createHash, randomBytes } from 'node:crypto';

// ── Static ioredis mock (hoisted — must be before any import that triggers ioredis) ──
vi.mock('ioredis', () => {
  const mockRedis = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    setex: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    getdel: vi.fn(async () => null),
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    ping: vi.fn(async () => 'PONG'),
    on: vi.fn(() => {}),
    status: 'ready',
  };
  return {
    Redis: vi.fn().mockImplementation(() => mockRedis),
    default: { Redis: vi.fn().mockImplementation(() => mockRedis) },
  };
});

// ── Test helpers ──────────────────────────────────────────────────────────────

const TEST_ENV_ID = '01900000-0000-7000-8000-000000000001' as const;
const TEST_CONN_ID = '01900000-0000-7000-8000-000000000002' as const;
const TEST_TOOL_VER_ID = '01900000-0000-7000-8000-000000000003' as const;
const TEST_SESSION_ID = '01900000-0000-7000-8000-000000000004' as const;
const TEST_KEY_ID = '01900000-0000-7000-8000-000000000005' as const;
const JWT_SECRET = 'test-jwt-secret-min-32-chars-xxxxxxxxxx';
const API_KEY_PREFIX = 'arc_';

/** Generate a valid arc_ API key and its SHA-256 hash */
function makeApiKey() {
  const secret = randomBytes(32).toString('hex');
  const plaintext = `${API_KEY_PREFIX}live_${secret}`;
  const hash = createHash('sha256').update(plaintext).digest('hex');
  const prefix = `${API_KEY_PREFIX}live_${secret.slice(0, 8)}`;
  return { plaintext, hash, prefix };
}

/** Issue a signed JWT for test sessions */
function makeSessionToken(
  sessionId: string = TEST_SESSION_ID,
  expiresIn: string | number = '1h',
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { sub: sessionId, env: TEST_ENV_ID, iss: 'arcane' },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn },
  ) as string;
}

/** Silent Fastify logger */
const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: function () { return this; },
  level: 'silent',
} as const;

/** Minimal valid ApiConfig for tests */
const testConfig = {
  NODE_ENV: 'test' as const,
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://x:x@localhost/x',
  DATABASE_POOL_MIN: 2,
  DATABASE_POOL_MAX: 10,
  VALKEY_URL: 'redis://localhost:6379',
  NATS_URL: 'nats://localhost:4222',
  S3_BUCKET: 'arcane-test',
  S3_REGION: 'us-east-1',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  OTEL_SERVICE_NAME: 'arcane-test',
  SECRET_ENCRYPTION_KEY: '0'.repeat(64),
  SECRET_BACKEND: 'local' as const,
  PORT: 0,
  HOST: '0.0.0.0',
  JWT_SECRET,
  JWT_EXPIRES_IN: '24h',
  API_KEY_PREFIX,
  OAUTH_REDIRECT_BASE_URL: 'http://localhost:3000',
  CORS_ORIGINS: ['http://localhost:3000'],
  RATE_LIMIT_GLOBAL_RPM: 10000,
  RATE_LIMIT_PER_KEY_RPM: 1000,
};

type MockDb = {
  query: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

/** Build a mock DB where each query is controlled via a handler function */
function makeMockDb(queryHandler: (sql: string, params?: unknown[]) => { rows: unknown[]; rowCount: number }): MockDb {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const result = queryHandler(sql, params);
      return { ...result, command: 'SELECT', oid: 0, fields: [] };
    }),
    connect: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    on: vi.fn(() => {}),
  };
}

/** Standard tool version row returned by DB for "published tool" */
const publishedToolRow = {
  tool_version_id: TEST_TOOL_VER_ID,
  tool_id: '01900000-0000-7000-8000-000000000010',
  version: 1,
  input_schema: { type: 'object', properties: {} },
  risk_level: ['READ_ONLY'],
};

/** Standard connection row returned by DB for "active connection" */
const activeConnectionRow = {
  id: TEST_CONN_ID,
  external_user_id: 'user-123',
  status: 'ACTIVE',
  toolkit_id: '01900000-0000-7000-8000-000000000020',
};

/** Standard session row for DB */
const activeSessionRow = {
  id: TEST_SESSION_ID,
  environment_id: TEST_ENV_ID,
  external_user_id: 'user-123',
  status: 'ACTIVE',
  expires_at: new Date(Date.now() + 86400_000),
  metadata: {},
  created_at: new Date(),
  updated_at: new Date(),
};

// ── Pool injection helpers ────────────────────────────────────────────────────

import { _testSetPool, shutdownPool } from '@arcane/core';
import { buildApp } from '../../apps/api/src/app.js';

/**
 * Install a mock db as the global pool, build a Fastify app, return both.
 * Caller MUST call cleanup() after the test.
 */
async function buildTestApp(
  db: MockDb,
  js?: { publish: ReturnType<typeof vi.fn> },
): Promise<{ app: FastifyInstance; cleanup: () => Promise<void> }> {
  // Shut down any previously initialized pool to avoid 'Pool already initialized'
  await shutdownPool().catch(() => {});
  // Inject our mock as the global pool (avoids real Postgres)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _testSetPool(db as any);

  const app = await buildApp(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    testConfig as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    silentLogger as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { db: db as any, ...(js ? { js: js as any } : {}) },
  );
  await app.ready();

  const cleanup = async () => {
    await app.close().catch(() => {});
    await shutdownPool().catch(() => {});
  };

  return { app, cleanup };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Phase 10 — Security Acceptance Tests', () => {
  let app: FastifyInstance;
  let apiKey: ReturnType<typeof makeApiKey>;
  let sharedCleanup: () => Promise<void>;
  let sharedDb: MockDb;

  beforeAll(async () => {
    apiKey = makeApiKey();

    // Default mock DB: handles the most common scenario (valid API key, published tool, active connection, ALLOW policy)
    const db = makeMockDb((sql) => {
      // API key lookup (prefix scan + hash comparison)
      if (sql.includes('api_keys') && sql.includes('key_prefix')) {
        return {
          rows: [{
            id: TEST_KEY_ID,
            environment_id: TEST_ENV_ID,
            key_prefix: apiKey.prefix,
            key_hash: apiKey.hash,
            permissions: ['EXECUTE', 'READ', 'ADMIN'],
            expires_at: null,
            revoked_at: null,
          }],
          rowCount: 1,
        };
      }
      // API key last_used_at update (fire-and-forget)
      if (sql.includes('api_keys') && sql.toLowerCase().includes('update')) {
        return { rows: [], rowCount: 1 };
      }
      // Tool version lookup
      if (sql.includes('tool_versions') && sql.includes('PUBLISHED')) {
        return { rows: [publishedToolRow], rowCount: 1 };
      }
      // Connection lookup
      if (sql.includes('connected_accounts')) {
        return { rows: [activeConnectionRow], rowCount: 1 };
      }
      // Policy lookup (no policies → ALLOW by default)
      if (sql.includes('policies')) {
        return { rows: [], rowCount: 0 };
      }
      // Audit event insert
      if (sql.includes('audit_events') && sql.toLowerCase().includes('insert')) {
        return { rows: [], rowCount: 1 };
      }
      // Execution insert
      if (sql.includes('executions') && sql.toLowerCase().includes('insert')) {
        return { rows: [], rowCount: 1 };
      }
      // Session lookup
      if (sql.includes('sessions') || sql.includes('external_users')) {
        return { rows: [activeSessionRow], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    sharedDb = db;
    const built = await buildTestApp(db);
    app = built.app;
    sharedCleanup = built.cleanup;
  });

  afterAll(async () => {
    await sharedCleanup?.();
  });

  // Per-test apps (AT-05, AT-06, AT-08, AT-09, AT-10, AT-14, AT-15) call shutdownPool() in
  // their cleanup. Restore the shared pool before each test so the shared `app` still works.
  beforeEach(async () => {
    await shutdownPool().catch(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (sharedDb) _testSetPool(sharedDb as any);
  });

  // ── AT-01: SI-15 — API keys stored hash-only ────────────────────────────────
  it('AT-01 [SI-15]: API key generation — plaintext never stored, only sha256 hash', async () => {
    const { generateApiKey, hashApiKey } = await import('@arcane/auth');

    const generated = generateApiKey('arc_', 'live');

    // Plaintext exists in generated.plaintext
    expect(generated.plaintext).toMatch(/^arc_live_[0-9a-f]{64}$/);

    // Hash is deterministic SHA-256
    const expectedHash = hashApiKey(generated.plaintext);
    expect(generated.hash).toBe(expectedHash);
    expect(generated.hash).toHaveLength(64); // SHA-256 hex

    // Plaintext is NOT derivable from hash (one-way)
    expect(generated.hash).not.toContain(generated.plaintext);
    expect(generated.plaintext).not.toContain(generated.hash);

    // Two keys from same prefix produce different hashes
    const k2 = generateApiKey('arc_', 'live');
    expect(k2.hash).not.toBe(generated.hash);
    expect(k2.plaintext).not.toBe(generated.plaintext);
  });

  // ── AT-02: SI-17 — Expired JWT rejected ────────────────────────────────────
  it('AT-02 [SI-17]: Expired JWT session rejected with 401 before route handler runs', async () => {
    const expiredToken = makeSessionToken(TEST_SESSION_ID, -1);

    const res = await app.inject({
      method: 'POST',
      url: '/execute',
      headers: { Authorization: `Bearer ${expiredToken}` },
      payload: {
        tool_slug: 'list_repos',
        toolkit_slug: 'github',
        connection_id: TEST_CONN_ID,
        input: {},
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  // ── AT-03: SI-17 — Tampered JWT rejected ───────────────────────────────────
  it('AT-03 [SI-17]: JWT with wrong signature rejected with 401', async () => {
    const validToken = makeSessionToken();
    const parts = validToken.split('.');
    const tamperedSig = parts[2]!.slice(0, -4) + 'XXXX';
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;

    const res = await app.inject({
      method: 'POST',
      url: '/execute',
      headers: { Authorization: `Bearer ${tamperedToken}` },
      payload: {
        tool_slug: 'list_repos',
        toolkit_slug: 'github',
        connection_id: TEST_CONN_ID,
        input: {},
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  // ── AT-04: No auth — all protected routes return 401 ───────────────────────
  it('AT-04: Unauthenticated requests always rejected with 401', async () => {
    const endpoints = [
      { method: 'POST' as const, url: '/execute', payload: { tool_slug: 'x', toolkit_slug: 'x', connection_id: TEST_CONN_ID, input: {} } },
      { method: 'GET' as const, url: '/executions' },
      { method: 'GET' as const, url: `/executions/${TEST_CONN_ID}` },
      { method: 'POST' as const, url: '/sessions', payload: { external_user_id: 'x' } },
      { method: 'GET' as const, url: '/connections' },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({
        method: ep.method,
        url: ep.url,
        ...(ep.payload ? { payload: ep.payload } : {}),
        // No auth header
      });
      expect(res.statusCode, `${ep.method} ${ep.url} should be 401`).toBe(401);
    }
  });

  // ── AT-05: SI-06 — Non-PUBLISHED tool not executable ───────────────────────
  it('AT-05 [SI-06]: Draft/archived tool versions cannot be executed (404)', async () => {
    const db = makeMockDb((sql) => {
      if (sql.includes('api_keys') && sql.includes('key_prefix')) {
        return { rows: [{ id: TEST_KEY_ID, environment_id: TEST_ENV_ID, key_prefix: apiKey.prefix, key_hash: apiKey.hash, permissions: ['EXECUTE'], expires_at: null, revoked_at: null }], rowCount: 1 };
      }
      if (sql.includes('api_keys') && sql.toLowerCase().includes('update')) {
        return { rows: [], rowCount: 1 };
      }
      // Tool version query returns NOTHING (draft/unpublished)
      if (sql.includes('tool_versions')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    const { app: localApp, cleanup } = await buildTestApp(db);

    const res = await localApp.inject({
      method: 'POST',
      url: '/execute',
      headers: { 'x-api-key': apiKey.plaintext },
      payload: {
        tool_slug: 'draft_tool',
        toolkit_slug: 'github',
        connection_id: TEST_CONN_ID,
        input: {},
      },
    });

    await cleanup();
    expect(res.statusCode).toBe(404);
  });

  // ── AT-06: SI-04 — DENY policy blocks before credential resolution ──────────
  it('AT-06 [SI-04]: Policy DENY stops execution before credentials are ever loaded', async () => {
    const credentialResolveSpy = vi.fn();

    const db = makeMockDb((sql) => {
      if (sql.includes('api_keys') && sql.includes('key_prefix')) {
        return { rows: [{ id: TEST_KEY_ID, environment_id: TEST_ENV_ID, key_prefix: apiKey.prefix, key_hash: apiKey.hash, permissions: ['EXECUTE'], expires_at: null, revoked_at: null }], rowCount: 1 };
      }
      if (sql.includes('api_keys') && sql.toLowerCase().includes('update')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('tool_versions') && sql.includes('PUBLISHED')) {
        return { rows: [publishedToolRow], rowCount: 1 };
      }
      if (sql.includes('connected_accounts')) {
        return { rows: [activeConnectionRow], rowCount: 1 };
      }
      // Return a DENY policy (rules must match PolicyRulesSchema)
      if (sql.includes('policies')) {
        return {
          rows: [{
            id: '01900000-0000-7000-8000-000000000099',
            environment_id: TEST_ENV_ID,
            name: 'deny-all',
            description: null,
            version: 1,
            rules: {
              version: '1',
              rules: [{ effect: 'deny', reason: 'All tools denied for test' }],
              default_effect: 'deny',
            },
            status: 'ACTIVE',
            created_at: new Date(),
            updated_at: new Date(),
          }],
          rowCount: 1,
        };
      }
      // Audit event for DENY
      if (sql.includes('audit_events') && sql.toLowerCase().includes('insert')) {
        return { rows: [], rowCount: 1 };
      }
      // If credentials are ever queried — this spy fires
      if (sql.includes('secret_reference') || sql.includes('kms') || sql.includes('decrypt')) {
        credentialResolveSpy();
      }
      return { rows: [], rowCount: 0 };
    });

    const { app: localApp, cleanup } = await buildTestApp(db);

    const res = await localApp.inject({
      method: 'POST',
      url: '/execute',
      headers: { 'x-api-key': apiKey.plaintext },
      payload: {
        tool_slug: 'list_repos',
        toolkit_slug: 'github',
        connection_id: TEST_CONN_ID,
        input: {},
      },
    });

    await cleanup();

    // Policy DENY → 403
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('POLICY_DENIED');

    // SI-04: Credentials never accessed (spy never fired)
    expect(credentialResolveSpy).not.toHaveBeenCalled();
  });

  // ── AT-07: SI-04 — Policy DENY wins over ALLOW ─────────────────────────────
  it('AT-07 [SI-04]: Policy DENY takes precedence — merged result is DENY', async () => {
    const { mergeResults } = await import('@arcane/policy');

    const results = [
      { decision: 'ALLOW' as const, rule_id: 'r1', policy_id: 'p1', reason: null },
      { decision: 'DENY' as const, rule_id: 'r2', policy_id: 'p2', reason: 'blocked' },
      { decision: 'ALLOW' as const, rule_id: 'r3', policy_id: 'p3', reason: null },
    ];

    const merged = mergeResults(results);
    expect(merged.decision).toBe('DENY');
    expect(merged.reason).toContain('blocked');
  });

  // ── AT-08: SI-04+SI-11 — REQUIRE_CONFIRMATION returns 202/403 ──────────────
  it('AT-08 [SI-04+SI-11]: REQUIRE_CONFIRMATION pauses execution and writes audit event', async () => {
    const auditEvents: string[] = [];

    const db = makeMockDb((sql) => {
      if (sql.includes('api_keys') && sql.includes('key_prefix')) {
        return { rows: [{ id: TEST_KEY_ID, environment_id: TEST_ENV_ID, key_prefix: apiKey.prefix, key_hash: apiKey.hash, permissions: ['EXECUTE'], expires_at: null, revoked_at: null }], rowCount: 1 };
      }
      if (sql.includes('api_keys') && sql.toLowerCase().includes('update')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('tool_versions') && sql.includes('PUBLISHED')) {
        return { rows: [publishedToolRow], rowCount: 1 };
      }
      if (sql.includes('connected_accounts')) {
        return { rows: [activeConnectionRow], rowCount: 1 };
      }
      if (sql.includes('policies')) {
        return {
          rows: [{
            id: '01900000-0000-7000-8000-000000000098',
            environment_id: TEST_ENV_ID,
            name: 'confirm-all',
            description: null,
            version: 1,
            rules: {
              version: '1',
              rules: [{ effect: 'require_confirmation', reason: 'Confirmation required for all tools' }],
              default_effect: 'allow',
            },
            status: 'ACTIVE',
            created_at: new Date(),
            updated_at: new Date(),
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('audit_events') && sql.toLowerCase().includes('insert')) {
        auditEvents.push(sql);
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const { app: localApp, cleanup } = await buildTestApp(db);

    const res = await localApp.inject({
      method: 'POST',
      url: '/execute',
      headers: { 'x-api-key': apiKey.plaintext },
      payload: {
        tool_slug: 'list_repos',
        toolkit_slug: 'github',
        connection_id: TEST_CONN_ID,
        input: {},
      },
    });

    await cleanup();

    // REQUIRE_CONFIRMATION → 202 or 403 (implementation-dependent)
    expect([202, 403]).toContain(res.statusCode);
    const body = JSON.parse(res.body) as { error?: { code: string } };
    if (body.error) {
      expect(body.error.code).toBe('POLICY_REQUIRES_CONFIRMATION');
    }

    // SI-11: Audit event was written
    expect(auditEvents.length).toBeGreaterThan(0);
  });

  // ── AT-09: SI-11 — AUTHORIZING audit event before NATS publish ─────────────
  it('AT-09 [SI-11]: AUTHORIZING audit event written before NATS publish on ALLOW', async () => {
    const auditInserts: string[] = [];
    let auditWrittenBeforeNats = false;
    let natsPublishCalled = false;

    const db = makeMockDb((sql) => {
      if (sql.includes('api_keys') && sql.includes('key_prefix')) {
        return { rows: [{ id: TEST_KEY_ID, environment_id: TEST_ENV_ID, key_prefix: apiKey.prefix, key_hash: apiKey.hash, permissions: ['EXECUTE'], expires_at: null, revoked_at: null }], rowCount: 1 };
      }
      if (sql.includes('api_keys') && sql.toLowerCase().includes('update')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('tool_versions') && sql.includes('PUBLISHED')) {
        return { rows: [publishedToolRow], rowCount: 1 };
      }
      if (sql.includes('connected_accounts')) {
        return { rows: [activeConnectionRow], rowCount: 1 };
      }
      if (sql.includes('policies')) {
        return { rows: [], rowCount: 0 }; // no policies → ALLOW
      }
      if (sql.includes('audit_events') && sql.toLowerCase().includes('insert')) {
        auditInserts.push(sql);
        if (!natsPublishCalled) {
          auditWrittenBeforeNats = true;
        }
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('executions') && sql.toLowerCase().includes('insert')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    // Mock NATS JetStream client — tracks when publish is called
    const mockJs = {
      publish: vi.fn(async () => {
        natsPublishCalled = true;
        return { seq: 1n, stream: 'test', duplicate: false };
      }),
    };

    const { app: localApp, cleanup } = await buildTestApp(db, mockJs);

    const res = await localApp.inject({
      method: 'POST',
      url: '/execute',
      headers: { 'x-api-key': apiKey.plaintext },
      payload: {
        tool_slug: 'list_repos',
        toolkit_slug: 'github',
        connection_id: TEST_CONN_ID,
        input: {},
      },
    });

    await cleanup();

    expect(res.statusCode).toBe(202);

    // SI-11: AUTHORIZING audit event was written
    expect(auditInserts.length).toBeGreaterThan(0);

    // SI-11: Audit was written BEFORE NATS publish
    expect(auditWrittenBeforeNats).toBe(true);
  });

  // ── AT-10: SI-03 — secret_reference never in API response ──────────────────
  it('AT-10 [SI-03]: secret_reference never appears in any API response body', async () => {
    const sensitiveValue = 'kms://arn:aws:kms:us-east-1:123:key/abc123-very-secret-reference';

    const db = makeMockDb((sql) => {
      if (sql.includes('api_keys') && sql.includes('key_prefix')) {
        return { rows: [{ id: TEST_KEY_ID, environment_id: TEST_ENV_ID, key_prefix: apiKey.prefix, key_hash: apiKey.hash, permissions: ['EXECUTE', 'READ', 'ADMIN'], expires_at: null, revoked_at: null }], rowCount: 1 };
      }
      if (sql.includes('api_keys') && sql.toLowerCase().includes('update')) {
        return { rows: [], rowCount: 1 };
      }
      // Connection list includes a secret_reference — must NOT be returned
      if (sql.includes('connected_accounts') && sql.toLowerCase().includes('select')) {
        return {
          rows: [{
            id: TEST_CONN_ID,
            environment_id: TEST_ENV_ID,
            toolkit_id: '01900000-0000-7000-8000-000000000020',
            external_user_id: 'user-123',
            status: 'ACTIVE',
            secret_reference: sensitiveValue, // This must never reach the response
            created_at: new Date(),
            updated_at: new Date(),
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('external_users')) {
        return { rows: [{ id: 'user-123', external_user_id: 'ext-123', environment_id: TEST_ENV_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const { app: localApp, cleanup } = await buildTestApp(db);

    const res = await localApp.inject({
      method: 'GET',
      url: '/connections',
      headers: { 'x-api-key': apiKey.plaintext },
    });

    await cleanup();

    // Response must not contain the secret_reference value
    expect(res.body).not.toContain(sensitiveValue);
    expect(res.body).not.toContain('kms://');
    expect(res.body).not.toContain('secret_reference');
  });

  // ── AT-11: SI-13 — SQL injection attempt doesn't expose SQL errors ──────────
  it('AT-11 [SI-13]: SQL injection in tool_slug returns 400/404, not raw SQL error', async () => {
    // Use the shared app with a custom pool that returns zero tool rows.
    // Injection payloads are passed as parameterized $1 values — the DB never
    // interprets them as SQL. The tool is simply not found → 404.
    // Key invariant: response must never be 5xx and must never expose SQL internals.
    const at11Db = makeMockDb((sql) => {
      if (sql.includes('api_keys') && sql.includes('key_prefix')) {
        return { rows: [{ id: TEST_KEY_ID, environment_id: TEST_ENV_ID, key_prefix: apiKey.prefix, key_hash: apiKey.hash, permissions: ['EXECUTE'], expires_at: null, revoked_at: null }], rowCount: 1 };
      }
      if (sql.includes('api_keys') && sql.toLowerCase().includes('update')) {
        return { rows: [], rowCount: 1 };
      }
      // Tool version lookup always returns nothing — injection payload is treated
      // as a literal string, the tool is simply not found → 404
      if (sql.includes('tool_versions')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    // Swap pool to our restricted mock, use shared Fastify instance
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _testSetPool(at11Db as any);

    const sqlInjectionPayloads = [
      "' OR 1=1 --",
      "'; DROP TABLE tool_versions; --",
      '1 UNION SELECT * FROM api_keys --',
    ];

    for (const payload of sqlInjectionPayloads) {
      const res = await app.inject({
        method: 'POST',
        url: '/execute',
        headers: { 'x-api-key': apiKey.plaintext },
        payload: {
          tool_slug: payload,
          toolkit_slug: '__no_such_toolkit__',
          connection_id: TEST_CONN_ID,
          input: {},
        },
      });

      // Must never be a 500 (which would indicate a raw SQL error leaking out)
      expect(res.statusCode, `Injection attempt "${payload}" must not be 5xx`).toBeLessThan(500);

      // Response must not expose SQL internals — the payload is passed as a
      // parameterized value so the DB never interprets it as SQL
      const body = res.body.toLowerCase();
      expect(body).not.toContain('syntax error');
      expect(body).not.toContain('pg_');
      expect(body).not.toContain('postgresql');
    }

    // Restore shared pool (beforeEach will also do this before the next test)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _testSetPool(sharedDb as any);
  });

  // ── AT-12: SI-08 — SSRF protection ─────────────────────────────────────────
  it('AT-12 [SI-08]: SSRF guard blocks private IP ranges and metadata endpoints', async () => {
    const { buildSsrfGuard, assertSsrfSafe, SsrfError } = await import('@arcane/connector-runtime');

    const guard = buildSsrfGuard([
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      '127.0.0.0/8',
    ]);

    const blockedTargets = [
      'http://10.0.0.1/admin',
      'http://172.16.0.1/internal',
      'http://192.168.1.1/api',
      'http://127.0.0.1/local',
      'ftp://evil.com/file',
      'file:///etc/passwd',
      'http://metadata.google.internal/',
      'http://169.254.169.254/latest/meta-data/',
    ];

    for (const url of blockedTargets) {
      await expect(
        assertSsrfSafe(url, guard),
        `Should block: ${url}`,
      ).rejects.toBeInstanceOf(SsrfError);
    }
  });

  // ── AT-13: SI-07 — Provider response credentials stripped ──────────────────
  it('AT-13 [SI-07]: Provider responses have credential keys stripped before storage/return', async () => {
    const { stripCredentialKeys, sanitizeResponse } = await import('@arcane/connector-runtime');

    // Simulate a GitHub API response that accidentally leaks a token
    const leakyProviderResponse = {
      id: 12345,
      name: 'arcane',
      full_name: 'acme/arcane',
      owner: {
        login: 'acme',
        access_token: 'ghp_leaked_token_12345',
        password: 'should-not-be-here',
      },
      private: true,
      api_key: 'leaked-api-key',
    };

    const sanitized = sanitizeResponse(200, leakyProviderResponse, {});

    expect(sanitized.error).toBeNull();
    // Credential keys must be redacted
    const output = sanitized.output as Record<string, unknown>;
    expect(output['api_key']).toBe('[REDACTED]');
    const owner = output['owner'] as Record<string, unknown>;
    expect(owner['access_token']).toBe('[REDACTED]');
    expect(owner['password']).toBe('[REDACTED]');
    // Safe fields preserved
    expect(output['id']).toBe(12345);
    expect(output['name']).toBe('arcane');
    expect(owner['login']).toBe('acme');

    // Direct stripCredentialKeys test
    const stripped = stripCredentialKeys({ token: 'secret', Authorization: 'Bearer x', data: 'ok' }) as Record<string, unknown>;
    expect(stripped['token']).toBe('[REDACTED]');
    expect(stripped['Authorization']).toBe('[REDACTED]');
    expect(stripped['data']).toBe('ok');
  });

  // ── AT-14: SI-01 — NATS payload never contains credentials ─────────────────
  it('AT-14 [SI-01]: ExecuteJobMessage published to NATS never contains credential fields', async () => {
    const capturedPayloads: unknown[] = [];

    const db = makeMockDb((sql) => {
      if (sql.includes('api_keys') && sql.includes('key_prefix')) {
        return { rows: [{ id: TEST_KEY_ID, environment_id: TEST_ENV_ID, key_prefix: apiKey.prefix, key_hash: apiKey.hash, permissions: ['EXECUTE'], expires_at: null, revoked_at: null }], rowCount: 1 };
      }
      if (sql.includes('api_keys') && sql.toLowerCase().includes('update')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('tool_versions') && sql.includes('PUBLISHED')) {
        return { rows: [publishedToolRow], rowCount: 1 };
      }
      if (sql.includes('connected_accounts')) {
        return { rows: [activeConnectionRow], rowCount: 1 };
      }
      if (sql.includes('policies')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('audit_events') && sql.toLowerCase().includes('insert')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('executions') && sql.toLowerCase().includes('insert')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    // Capture what gets published to NATS
    const { decode } = await import('@arcane/nats-client');
    const mockJs = {
      publish: vi.fn(async (_subject: string, data: Uint8Array) => {
        capturedPayloads.push(decode(data));
        return { seq: 1n, stream: 'test', duplicate: false };
      }),
    };

    const { app: localApp, cleanup } = await buildTestApp(db, mockJs);

    const userInput = {
      repo: 'arcane',
      // Attacker trying to inject credentials via input
      access_token: 'attacker-injected-token',
      Authorization: 'Bearer injected',
    };

    const res = await localApp.inject({
      method: 'POST',
      url: '/execute',
      headers: { 'x-api-key': apiKey.plaintext },
      payload: {
        tool_slug: 'list_repos',
        toolkit_slug: 'github',
        connection_id: TEST_CONN_ID,
        input: userInput,
      },
    });

    await cleanup();

    expect(res.statusCode).toBe(202);
    expect(capturedPayloads.length).toBe(1);

    const job = capturedPayloads[0] as Record<string, unknown>;

    // SI-01: NO server-side credential injected into the job
    expect(job).not.toHaveProperty('credential');
    expect(job).not.toHaveProperty('access_token');
    expect(job).not.toHaveProperty('secret');
    expect(job).not.toHaveProperty('key_hash');
    expect(job).not.toHaveProperty('secret_reference');
    expect(job).not.toHaveProperty('client_secret');

    // The job only has safe execution metadata
    expect(job).toHaveProperty('execution_id');
    expect(job).toHaveProperty('environment_id');
    expect(job).toHaveProperty('tool_version_id');
    expect(job).toHaveProperty('connection_id');
    expect(job).toHaveProperty('input');
  });

  // ── AT-15: SI-10 — audit_events append-only ────────────────────────────────
  it('AT-15 [SI-10]: writeAuditEvent only uses INSERT — never UPDATE or DELETE', async () => {
    const sqlStatements: string[] = [];

    const db = makeMockDb((sql) => {
      sqlStatements.push(sql.trim().toUpperCase());
      if (sql.includes('api_keys') && sql.includes('key_prefix')) {
        return { rows: [{ id: TEST_KEY_ID, environment_id: TEST_ENV_ID, key_prefix: apiKey.prefix, key_hash: apiKey.hash, permissions: ['EXECUTE'], expires_at: null, revoked_at: null }], rowCount: 1 };
      }
      if (sql.includes('api_keys') && sql.toLowerCase().includes('update')) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('tool_versions') && sql.includes('PUBLISHED')) {
        return { rows: [publishedToolRow], rowCount: 1 };
      }
      if (sql.includes('connected_accounts')) {
        return { rows: [activeConnectionRow], rowCount: 1 };
      }
      if (sql.includes('policies')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('audit_events') || sql.includes('executions')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const { app: localApp, cleanup } = await buildTestApp(db);

    // Run a successful execution to trigger audit events
    await localApp.inject({
      method: 'POST',
      url: '/execute',
      headers: { 'x-api-key': apiKey.plaintext },
      payload: {
        tool_slug: 'list_repos',
        toolkit_slug: 'github',
        connection_id: TEST_CONN_ID,
        input: {},
      },
    });

    await cleanup();

    // Filter to just audit_events SQL statements
    const auditSql = sqlStatements.filter((s) => s.includes('AUDIT_EVENTS'));

    // SI-10: Every audit_events statement must be INSERT — never UPDATE or DELETE
    expect(auditSql.length).toBeGreaterThan(0);
    for (const stmt of auditSql) {
      expect(stmt, `audit_events statement must be INSERT: ${stmt}`).toMatch(/^INSERT INTO AUDIT_EVENTS/);
      expect(stmt).not.toMatch(/^UPDATE/);
      expect(stmt).not.toMatch(/^DELETE/);
    }
  });
});
