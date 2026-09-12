/**
 * @arcane/config
 *
 * Typed, Zod-validated environment configuration.
 * All services pull config from this package — no raw process.env access elsewhere.
 */

import { z } from 'zod';

// ─── Helpers ─────────────────────────────────────────────────────────────────


const url = (): z.ZodString => z.string().url();

const requiredString = (): z.ZodString => z.string().min(1);

// ─── Base config (all services share this) ────────────────────────────────────

export const BaseConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Database
  DATABASE_URL: requiredString(),
  DATABASE_POOL_MIN: z.string().default('2').transform(Number),
  DATABASE_POOL_MAX: z.string().default('10').transform(Number),

  // Valkey / Redis
  VALKEY_URL: requiredString().default('redis://localhost:6379'),

  // NATS JetStream
  NATS_URL: requiredString().default('nats://localhost:4222'),

  // Object storage (S3-compatible)
  S3_ENDPOINT: url().optional(),
  S3_BUCKET: requiredString().default('arcane'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: requiredString().optional(),
  S3_SECRET_ACCESS_KEY: requiredString().optional(),

  // OpenTelemetry
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default('http://localhost:4318'),
  OTEL_SERVICE_NAME: requiredString(),

  // KMS / Secrets
  SECRET_ENCRYPTION_KEY: requiredString(), // 32-byte hex — master key for envelope encryption
  SECRET_BACKEND: z.enum(['local', 'aws-kms', 'gcp-kms', 'openbao']).default('local'),
  KMS_KEY_ID: z.string().optional(), // Required for cloud KMS backends
});

export type BaseConfig = z.infer<typeof BaseConfigSchema>;

// ─── API service config ────────────────────────────────────────────────────────

export const ApiConfigSchema = BaseConfigSchema.extend({
  OTEL_SERVICE_NAME: z.string().default('arcane-api'),
  PORT: z.string().default('3001').transform(Number),
  HOST: z.string().default('0.0.0.0'),

  // Platform auth
  JWT_SECRET: requiredString(),
  JWT_EXPIRES_IN: z.string().default('24h'),
  API_KEY_PREFIX: z.string().default('arc_'),

  // OAuth redirect base (for callback URLs)
  OAUTH_REDIRECT_BASE_URL: url(),

  // CORS
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',')),

  // Rate limiting
  RATE_LIMIT_GLOBAL_RPM: z.string().default('1000').transform(Number),
  RATE_LIMIT_PER_KEY_RPM: z.string().default('60').transform(Number),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;

// ─── Connector Runtime config ──────────────────────────────────────────────────

export const ConnectorRuntimeConfigSchema = BaseConfigSchema.extend({
  OTEL_SERVICE_NAME: z.string().default('arcane-connector-runtime'),

  // NATS subjects
  NATS_SUBJECT_EXECUTE: z.string().default('executions.run'),
  NATS_SUBJECT_RESULT: z.string().default('executions.result'),
  NATS_CONSUMER_GROUP: z.string().default('connector-runtime'),

  // HTTP execution limits
  HTTP_TIMEOUT_MS: z.string().default('30000').transform(Number),
  HTTP_MAX_RESPONSE_BYTES: z.string().default('10485760').transform(Number), // 10MB

  // SSRF protection: comma-separated CIDR blocks to block (SI-08)
  SSRF_BLOCKED_CIDRS: z
    .string()
    .default('10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8,::1/128,fc00::/7')
    .transform((v) => v.split(',')),

  // Execution concurrency
  MAX_CONCURRENT_EXECUTIONS: z.string().default('50').transform(Number),
});

export type ConnectorRuntimeConfig = z.infer<typeof ConnectorRuntimeConfigSchema>;

// ─── MCP Gateway config ────────────────────────────────────────────────────────

export const McpConfigSchema = BaseConfigSchema.extend({
  OTEL_SERVICE_NAME: z.string().default('arcane-mcp-gateway'),
  PORT: z.string().default('3002').transform(Number),
  HOST: z.string().default('0.0.0.0'),

  // Session token verification — must match the API's JWT_SECRET
  JWT_SECRET: requiredString(),

  // Delegates execution to the API — NEVER calls providers directly
  EXECUTION_GATEWAY_URL: url().default('http://localhost:3001'),
});

export type McpConfig = z.infer<typeof McpConfigSchema>;

// ─── Webhook ingress config ────────────────────────────────────────────────────

export const WebhookIngressConfigSchema = BaseConfigSchema.extend({
  OTEL_SERVICE_NAME: z.string().default('arcane-webhook-ingress'),
  PORT: z.string().default('3003').transform(Number),
  HOST: z.string().default('0.0.0.0'),
  MAX_PAYLOAD_BYTES: z.string().default('1048576').transform(Number), // 1MB default
});

export type WebhookIngressConfig = z.infer<typeof WebhookIngressConfigSchema>;

// ─── Config loader ────────────────────────────────────────────────────────────

export function loadConfig<T extends z.ZodSchema>(
  schema: T,
  env: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${formatted}`);
  }
  return result.data as z.infer<T>;
}

// ─── Environment helpers ──────────────────────────────────────────────────────

export function isProduction(config: BaseConfig): boolean {
  return config.NODE_ENV === 'production';
}

export function isDevelopment(config: BaseConfig): boolean {
  return config.NODE_ENV === 'development';
}

export function isTest(config: BaseConfig): boolean {
  return config.NODE_ENV === 'test';
}
