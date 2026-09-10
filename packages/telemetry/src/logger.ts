/**
 * Structured logger — pino with OTel trace context injection.
 *
 * Rules:
 * - Use this logger everywhere. console.log/warn/error is forbidden (eslint enforces it).
 * - NEVER log secrets, credentials, or raw API keys. Log opaque references only.
 * - NEVER log full request/response bodies from external providers (may contain PII/secrets).
 * - Child loggers are the pattern: logger.child({ requestId }) in middleware.
 *
 * The logger automatically injects trace_id and span_id from the active
 * OTel span so every log line can be correlated to a trace in Tempo/Grafana.
 */

import pino from 'pino';

export type Logger = pino.Logger;
export type ChildLogger = pino.Logger;

export interface LoggerConfig {
  level?: string;
  serviceName: string;
  environment?: string;
  /** Set to true in dev for pretty-printed output */
  pretty?: boolean;
}

let _rootLogger: pino.Logger | null = null;

/**
 * Initialize the root logger. Call once at startup after initOtel().
 */
export function initLogger(config: LoggerConfig): pino.Logger {
  if (_rootLogger !== null) {
    return _rootLogger;
  }

  const level = config.level ?? (config.environment === 'production' ? 'info' : 'debug');

  const baseConfig: pino.LoggerOptions = {
    level,
    base: {
      service: config.serviceName,
      env: config.environment ?? 'development',
    },
    // Rename pino's `msg` to `message` for Loki compatibility
    messageKey: 'message',
    timestamp: pino.stdTimeFunctions.isoTime,
    // Redact sensitive fields that should never appear in logs
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        'req.headers.cookie',
        '*.secret',
        '*.password',
        '*.token',
        '*.api_key',
        '*.key_hash',
        '*.secret_reference', // Only the reference string, not a real secret — but still redact
      ],
      censor: '[REDACTED]',
    },
  };

  if (config.pretty) {
    _rootLogger = pino({
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    });
  } else {
    // Production: JSON to stdout, pino-opentelemetry-transport injects trace context
    _rootLogger = pino({
      ...baseConfig,
      transport: {
        targets: [
          {
            target: 'pino-opentelemetry-transport',
            options: {},
          },
          {
            target: 'pino/file',
            options: { destination: 1 }, // stdout
          },
        ],
      },
    });
  }

  return _rootLogger;
}

/**
 * Get the initialized root logger. Throws if initLogger() was never called.
 */
export function getLogger(): pino.Logger {
  if (_rootLogger === null) {
    throw new Error('Logger not initialized — call initLogger() before getLogger()');
  }
  return _rootLogger;
}

/**
 * Create a child logger with additional bound fields.
 * Pattern: const log = getLogger().child({ requestId, orgId });
 */
export function childLogger(bindings: Record<string, unknown>): pino.Logger {
  return getLogger().child(bindings);
}

// ─── Convenience re-export for tests / bootstrap contexts ─────────────────────

/** A minimal no-op logger safe to use before initLogger() in tests */
export const noopLogger: pino.Logger = pino({ level: 'silent' });
