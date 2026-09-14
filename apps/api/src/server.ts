/**
 * Arcane API — entry point.
 *
 * Boot order:
 *   1. OTel (instrument before any other imports)
 *   2. Logger
 *   3. Config validation (fail fast if env is wrong)
 *   4. DB pool
 *   5. Fastify app
 *   6. Listen
 */

// OTel MUST be first — instruments pg, http, etc. at import time
import { initOtel, initLogger, getLogger, shutdownOtel } from '@arcane/telemetry';
import { loadConfig, ApiConfigSchema } from '@arcane/config';
import { initPool, getPool, shutdownPool, checkDbHealth } from '@arcane/core';
import { buildApp } from './app.js';

const config = loadConfig(ApiConfigSchema, process.env);

// 1. Telemetry
initOtel({
  serviceName: config.OTEL_SERVICE_NAME,
  otlpEndpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  environment: config.NODE_ENV,
});

// 2. Logger
const log = initLogger({
  serviceName: config.OTEL_SERVICE_NAME,
  environment: config.NODE_ENV,
  pretty: config.NODE_ENV === 'development',
});

// 3. DB pool
initPool({
  connectionString: config.DATABASE_URL,
  min: config.DATABASE_POOL_MIN,
  max: config.DATABASE_POOL_MAX,
});

async function main(): Promise<void> {
  // Verify DB connectivity before accepting traffic
  const dbOk = await checkDbHealth();
  if (!dbOk) {
    log.error('Database health check failed — aborting startup');
    process.exit(1);
  }

  const app = await buildApp(config, log, { db: getPool() });

  await app.listen({ port: config.PORT, host: config.HOST });
  log.info({ port: config.PORT, host: config.HOST }, 'Arcane API listening');
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  getLogger().info({ signal }, 'Received shutdown signal');
  await Promise.all([shutdownPool(), shutdownOtel()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((err) => {
  // Logger may not be ready — use console as last resort
  console.error('Fatal startup error', err);
  process.exit(1);
});
