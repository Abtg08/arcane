/**
 * Application-level metrics — Prometheus via OTel.
 *
 * Metric naming follows OpenTelemetry semantic conventions where applicable.
 * All metrics are prefixed with `arcane_`.
 */

import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('arcane', '0.1.0');

// ─── Execution metrics ─────────────────────────────────────────────────────────

export const executionCounter = meter.createCounter('arcane_executions_total', {
  description: 'Total number of tool executions',
  unit: '1',
});

export const executionDuration = meter.createHistogram('arcane_execution_duration_ms', {
  description: 'Tool execution duration in milliseconds',
  unit: 'ms',
  advice: {
    explicitBucketBoundaries: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
  },
});

export const executionErrorCounter = meter.createCounter('arcane_execution_errors_total', {
  description: 'Total number of failed tool executions',
  unit: '1',
});

// ─── Policy metrics ────────────────────────────────────────────────────────────

export const policyEvalCounter = meter.createCounter('arcane_policy_evaluations_total', {
  description: 'Total number of policy evaluations',
  unit: '1',
});

export const policyDenialCounter = meter.createCounter('arcane_policy_denials_total', {
  description: 'Total number of policy-denied execution attempts',
  unit: '1',
});

// ─── Session metrics ───────────────────────────────────────────────────────────

export const activeSessionsGauge = meter.createUpDownCounter('arcane_active_sessions', {
  description: 'Number of currently active sessions',
  unit: '1',
});

// ─── Webhook delivery metrics ──────────────────────────────────────────────────

export const webhookDeliveryCounter = meter.createCounter('arcane_webhook_deliveries_total', {
  description: 'Total number of webhook delivery attempts',
  unit: '1',
});

export const webhookDeliveryDuration = meter.createHistogram('arcane_webhook_delivery_duration_ms', {
  description: 'Webhook delivery duration in milliseconds',
  unit: 'ms',
  advice: {
    explicitBucketBoundaries: [50, 100, 250, 500, 1000, 2500, 5000],
  },
});

// ─── API metrics ───────────────────────────────────────────────────────────────

export const apiRequestCounter = meter.createCounter('arcane_api_requests_total', {
  description: 'Total number of API requests',
  unit: '1',
});

export const apiRequestDuration = meter.createHistogram('arcane_api_request_duration_ms', {
  description: 'API request duration in milliseconds',
  unit: 'ms',
  advice: {
    explicitBucketBoundaries: [5, 10, 25, 50, 100, 250, 500, 1000, 2500],
  },
});

// ─── Rate limit metrics ────────────────────────────────────────────────────────

export const rateLimitCounter = meter.createCounter('arcane_rate_limit_hits_total', {
  description: 'Total number of rate limit hits',
  unit: '1',
});

// ─── Credential resolution metrics ────────────────────────────────────────────

export const credentialCacheHitCounter = meter.createCounter('arcane_credential_cache_hits_total', {
  description: 'Credential cache hits vs misses',
  unit: '1',
});
