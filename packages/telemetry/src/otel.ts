/**
 * OpenTelemetry SDK initialization.
 *
 * MUST be imported at the very top of the process entry point, before any
 * other imports — OTel instruments modules at require/import time.
 *
 * SECURITY: The OTel collector config scrubs auth headers and hashes SQL
 * statements before export (see infra/docker/otel/config.yaml).
 * This module NEVER sends raw SQL or auth tokens to the collector directly.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

let _sdk: NodeSDK | null = null;

export interface OtelConfig {
  serviceName: string;
  serviceVersion?: string;
  otlpEndpoint: string; // e.g. http://otel-collector:4317
  environment?: string;
}

/**
 * Initialize and start the OTel SDK.
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

  const metricExporter = new OTLPMetricExporter({
    url: config.otlpEndpoint,
  });

  _sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader: new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 15_000,
    }),
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
    await _sdk?.shutdown();
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
}
