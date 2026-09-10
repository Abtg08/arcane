/**
 * Arcane MCP Gateway — entry point.
 *
 * The MCP gateway exposes Arcane tools over the Model Context Protocol.
 * It delegates ALL execution to the API service — it NEVER resolves
 * credentials or calls external providers directly.
 *
 * SECURITY INVARIANT: mcp-gateway has no DB connection and no KMS access.
 * It is a thin protocol adapter between MCP clients and the API.
 */

import { initOtel, initLogger, shutdownOtel } from '@arcane/telemetry';
import { loadConfig, McpConfigSchema } from '@arcane/config';

const config = loadConfig(McpConfigSchema, process.env);

initOtel({
  serviceName: 'arcane-mcp-gateway',
  otlpEndpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
  environment: config.NODE_ENV,
});

const log = initLogger({
  serviceName: 'arcane-mcp-gateway',
  environment: config.NODE_ENV,
  pretty: config.NODE_ENV === 'development',
});

// TODO Phase 4: Implement MCP protocol server
// - Receive MCP tool-call requests
// - Validate session token
// - Forward to EXECUTION_GATEWAY_URL (the API)
// - Stream responses back to MCP client
// - Apply per-session tool allowlist from session.tools

log.info(
  { port: config.MCP_PORT, gatewayUrl: config.EXECUTION_GATEWAY_URL },
  'Arcane MCP Gateway starting (stub — Phase 4)',
);

process.on('SIGTERM', () => {
  void shutdownOtel().then(() => process.exit(0));
});
