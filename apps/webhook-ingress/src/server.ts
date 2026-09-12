/**
 * Arcane Webhook Ingress — server entry point.
 *
 * Receives inbound webhooks from providers (GitHub, Stripe, etc.),
 * verifies HMAC signatures, stores events, and publishes to NATS.
 *
 * Intentionally stateless: no DB auth, no session management.
 * All auth is via HMAC signature on the webhook payload.
 */

import Fastify from 'fastify';
import { initOtel, initLogger, shutdownOtel } from '@arcane/telemetry';
import { loadConfig, WebhookIngressConfigSchema } from '@arcane/config';
import { connectNats } from '@arcane/nats-client';
import { registerIngressRoutes } from './handler.js';

const config = loadConfig(WebhookIngressConfigSchema, process.env);

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

// NATS connection (retry on startup)
const nats = await connectNats({ url: config.NATS_URL });

await app.register(registerIngressRoutes, { config, js: nats.js });

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  log.info({ port: config.PORT }, 'Webhook ingress started');
} catch (err) {
  log.error({ err }, 'Webhook ingress failed to start');
  process.exit(1);
}

async function shutdown(signal: string): Promise<void> {
  log.info({ signal }, 'Webhook ingress shutting down');
  await app.close();
  await nats.close();
  await shutdownOtel();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
