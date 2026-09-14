/**
 * OpenTelemetry SDK initialization.
 *
 * MUST be imported at the very top of the process entry point, before any
 * other imports — OTel instruments modules at require/import time.
 *
 * SECURITY: The OTel collector config scrubs auth headers and hashes SQL
 * statements before export (see infra/docker/otel/config.yaml).
 * This module NEVER sends raw SQL or auth tokens to the collector directly.
 *
 * Metric export strategy (dual):
 *   1. OTLP push  → OTel collector → Prometheus remote write (15s interval)
 *   2. Prometheus pull → /metrics route in Fastify → Prometheus scrape (15s)
 * Both paths see the same MeterProvider / counters / histograms.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import type { MetricReader } from '@opentelemetry/sdk-metrics';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { metrics } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

let _sdk: NodeSDK | null = null;
let _prometheusExporter: PrometheusExporter | null = null;

export interface OtelConfig {
  serviceName: string;
  serviceVersion?: string;
  otlpEndpoint: string; // e.g. http://otel-collector:4317
  environment?: string;
}

/**
 * Initialize and start the OTel SDK with dual metric export (OTLP push + Prometheus pull).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initOtel(config: OtelConfig): void {
  if (_sdk !== null) {
    return;
  }

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion ?? '0.1.0',
    'deployment.environment': config.environment ?? 'development',
  });

  const traceExporter = new OTLPTraceExporter({
    url: config.otlpEndpoint,
  });

  const otlpMetricExporter = new OTLPMetricExporter({
    url: config.otlpEndpoint,
  });

  // Prometheus pull exporter — no built-in server; exposed via Fastify /metrics route
  _prometheusExporter = new PrometheusExporter(
    { preventServerStart: true },
  );

  // Build MeterProvider with both readers so all meters (OTel auto + app) export to both
  const meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: otlpMetricExporter,
        exportIntervalMillis: 15_000,
      }),
      // Cast needed: minor private-field signature mismatch between sdk-metrics and exporter-prometheus versions
      _prometheusExporter as unknown as MetricReader,
    ],
  });

  // Set global before NodeSDK starts so auto-instrumentation uses this provider
  metrics.setGlobalMeterProvider(meterProvider);

  _sdk = new NodeSDK({
    resource,
    traceExporter,
    // No metricReader here — MeterProvider already set globally above
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable noisy fs instrumentation
        '@opentelemetry/instrumentation-fs': { enabled: false },
        // HTTP instrumentation — collector scrubs auth headers before export
        '@opentelemetry/instrumentation-http': { enabled: true },
        // pg instrumentation — collector hashes db.statement before export
        '@opentelemetry/instrumentation-pg': { enabled: true },
      }),
    ],
  });

  _sdk.start();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await meterProvider.shutdown();
    await _sdk?.shutdown();
  });
}

/**
 * Collect Prometheus text format metrics for the /metrics scrape endpoint.
 * Returns null if OTel has not been initialized (safe for test environments).
 */
export function collectPrometheusMetrics(): Promise<string | null> {
  if (_prometheusExporter === null) return Promise.resolve(null);

  const exporter = _prometheusExporter;
  return new Promise<string>((resolve) => {
    // Build a minimal mock IncomingMessage / ServerResponse for the handler
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end(chunk: string) { resolve(chunk ?? ''); },
    };
    exporter.getMetricsRequestHandler(
      // req is only used to read url/method; not needed for our use case
      null as unknown as Parameters<typeof exporter.getMetricsRequestHandler>[0],
      res as unknown as Parameters<typeof exporter.getMetricsRequestHandler>[1],
    );
  });
}

/**
 * Flush and shut down the OTel SDK. Call on graceful shutdown.
 */
export async function shutdownOtel(): Promise<void> {
  if (_sdk) {
    await _sdk.shutdown();
    _sdk = null;
  }
  _prometheusExporter = null;
}
