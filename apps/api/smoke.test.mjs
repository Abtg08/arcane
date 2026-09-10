/**
 * Minimal smoke test — runs app without a real DB, validates HTTP layer.
 * Run: node apps/api/smoke.test.mjs
 */
import { buildApp } from './dist/app.js';

// Silent logger compatible with FastifyBaseLogger
const logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => logger,
  level: 'silent',
};

// Minimal mock DB (Pool-shaped) — never called during smoke tests
const mockDb = {
  query: async () => ({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] }),
  connect: async () => {},
  end: async () => {},
  on: () => {},
};

const config = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgresql://x:x@localhost/x',
  DATABASE_POOL_MIN: 2,
  DATABASE_POOL_MAX: 10,
  VALKEY_URL: 'redis://localhost:6379',
  NATS_URL: 'nats://localhost:4222',
  S3_BUCKET: 'arcane',
  S3_REGION: 'us-east-1',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  OTEL_SERVICE_NAME: 'arcane-api-test',
  SECRET_ENCRYPTION_KEY: '0'.repeat(64),
  SECRET_BACKEND: 'local',
  PORT: 0,
  HOST: '0.0.0.0',
  JWT_SECRET: 'test-secret-min-32-chars-xxxxxxxxxx',
  JWT_EXPIRES_IN: '24h',
  API_KEY_PREFIX: 'arc_',
  OAUTH_REDIRECT_BASE_URL: 'http://localhost:3000',
  CORS_ORIGINS: ['http://localhost:3000'],
  RATE_LIMIT_GLOBAL_RPM: 1000,
  RATE_LIMIT_PER_KEY_RPM: 60,
};

console.log('Building Fastify app...');
const app = await buildApp(config, logger, { db: mockDb });
await app.ready();
console.log('✅ App ready');

// Test /health
const healthRes = await app.inject({ method: 'GET', url: '/health' });
console.log(`GET /health → ${healthRes.statusCode} ${healthRes.body}`);
if (healthRes.statusCode !== 200) throw new Error('Health check failed');
console.log('✅ /health OK');

// Test /docs/json (OpenAPI spec)
const docsRes = await app.inject({ method: 'GET', url: '/docs/json' });
console.log(`GET /docs/json → ${docsRes.statusCode} (${docsRes.body.length} bytes)`);
if (docsRes.statusCode !== 200) throw new Error('Docs endpoint failed');
const spec = JSON.parse(docsRes.body);
const paths = Object.keys(spec.paths ?? {});
console.log(`  paths: ${paths.join(', ')}`);
const requiredPaths = ['/sessions', '/connections', '/toolkits', '/execute', '/executions'];
for (const p of requiredPaths) {
  if (!paths.some(k => k === p || k.startsWith(p + '/'))) throw new Error(`Missing ${p} in OpenAPI spec`);
}
console.log(`✅ /docs/json OK — Phase 1-C routes registered: ${requiredPaths.join(', ')}`);

// Test /sessions without auth — should 401
const noAuthRes = await app.inject({ method: 'POST', url: '/sessions', payload: { external_user_id: 'test' } });
console.log(`POST /sessions (no auth) → ${noAuthRes.statusCode} ${noAuthRes.body}`);
if (noAuthRes.statusCode !== 401) throw new Error(`Expected 401, got ${noAuthRes.statusCode}`);
console.log('✅ Auth enforcement working');

// Test /execute without auth — should 401 (send valid body so schema passes, auth runs)
const noAuthExecRes = await app.inject({
  method: 'POST',
  url: '/execute',
  payload: {
    tool_slug: 'list_repos',
    toolkit_slug: 'github',
    connection_id: '00000000-0000-0000-0000-000000000000',
    input: {},
  },
});
console.log(`POST /execute (no auth) → ${noAuthExecRes.statusCode}`);
if (noAuthExecRes.statusCode !== 401) throw new Error(`Expected 401, got ${noAuthExecRes.statusCode}`);
console.log('✅ Execution auth enforcement working');

await app.close();
console.log('\n✅ All smoke tests passed');
