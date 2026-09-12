/**
 * Arcane MCP Gateway — server entry point.
 *
 * Exposes the Model Context Protocol (Streamable HTTP transport) on /mcp.
 * Delegates ALL execution to the Execution Gateway (API service).
 *
 * SI-09: This process has NO database connection and NO KMS access.
 *        It is a thin protocol adapter. Credentials never enter this process.
 */

import Fastify from 'fastify';
import { initOtel, initLogger, shutdownOtel } from '@arcane/telemetry';
import { loadConfig, McpConfigSchema } from '@arcane/config';
import { registerMcpRoutes } from './handler.js';

const config = loadConfig(McpConfigSchema, process.env);

initOtel({
  serviceName: config.OTEL_SERVICE_NAME,
  otlpEndpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  environment: config.NODE_ENV,
});

const log = initLogger({
  serviceName: config.OTEL_SERVICE_NAME,
  environment: config.NODE_ENV,
  pretty: config.NODE_ENV === 'development',
});

const app = Fastify({ logger: false });

// ── Routes ────────────────────────────────────────────────────────────────────

await app.register(registerMcpRoutes, { config });

// ── Start ─────────────────────────────────────────────────────────────────────

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  log.info({ port: config.PORT, gateway: config.EXECUTION_GATEWAY_URL }, 'MCP Gateway started');
} catch (err) {
  log.error({ err }, 'MCP Gateway failed to start');
  process.exit(1);
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'MCP Gateway shutting down');
  await app.close();
  await shutdownOtel();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
