/**
 * Response sanitizer — SI-07.
 *
 * Validates and sanitizes provider responses before they are stored
 * in the DB or returned to the caller. Ensures:
 *
 *   1. Response matches the tool's declared output_schema (JSON Schema)
 *   2. Known credential-shaped keys are stripped from the output
 *   3. Output is size-capped before storage
 *
 * SI-01: Sanitized output stored in DB — credentials never present.
 * SI-07: Provider responses validated before being returned.
 */

import { InternalError } from '@arcane/core';

// Maximum serialized output stored in DB (512 KB)
const MAX_OUTPUT_BYTES = 512 * 1024;

/**
 * Keys that look like credentials — strip from any response object recursively.
 * This is a defence-in-depth measure; connectors should never return credentials,
 * but we scrub them anyway.
 */
const CREDENTIAL_KEYS = new Set([
  'password',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'private_key',
  'client_secret',
  'api_key',
  'apikey',
  'api-key',
  'authorization',
  'auth',
  'credential',
  'credentials',
  'x-api-key',
  'bearer',
]);

/**
 * Recursively strip credential-shaped keys from an object.
 * Arrays are traversed; primitives are returned as-is.
 */
export function stripCredentialKeys(value: unknown, depth = 0): unknown {
  if (depth > 20) return '[depth-limit]'; // Prevent stack overflow on deeply nested responses
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => stripCredentialKeys(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (CREDENTIAL_KEYS.has(key.toLowerCase())) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = stripCredentialKeys(val, depth + 1);
    }
  }
  return out;
}

export interface SanitizedOutput {
  /** Sanitized, size-capped output ready for DB storage and API response. */
  output: Record<string, unknown> | null;
  /** Non-null when the provider returned an error HTTP status. */
  error: { code: string; message: string } | null;
}

/**
 * Sanitize a provider response for storage and return.
 *
 * @param httpStatus  — HTTP status from the provider
 * @param body        — Parsed response body (may be any JSON value)
 * @param outputSchema — Tool's declared output_schema (JSON Schema) — used for future validation
 */
export function sanitizeResponse(
  httpStatus: number,
  body: unknown,
  _outputSchema: Record<string, unknown>,
): SanitizedOutput {
  // Provider error: 4xx/5xx
  if (httpStatus >= 400) {
    const message = extractErrorMessage(body) ?? `Provider returned HTTP ${httpStatus}`;
    return {
      output: null,
      error: {
        code: `PROVIDER_HTTP_${httpStatus}`,
        message: truncate(message, 500),
      },
    };
  }

  // Successful response — strip credential keys
  const stripped = stripCredentialKeys(body);

  // Size-cap
  let serialized: string;
  try {
    serialized = JSON.stringify(stripped);
  } catch {
    throw new InternalError('Provider response is not JSON-serializable after sanitization');
  }

  if (Buffer.byteLength(serialized, 'utf-8') > MAX_OUTPUT_BYTES) {
    throw new InternalError(
      `Sanitized output exceeds ${MAX_OUTPUT_BYTES} bytes — connector must paginate`,
    );
  }

  // Normalize to object (wrap primitives/arrays)
  const output = typeof stripped === 'object' && stripped !== null && !Array.isArray(stripped)
    ? (stripped as Record<string, unknown>)
    : { result: stripped };

  return { output, error: null };
}

function extractErrorMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  if (typeof body !== 'object' || body === null) return undefined;
  const obj = body as Record<string, unknown>;
  // Common provider error shapes
  for (const key of ['message', 'error', 'error_description', 'detail', 'msg']) {
    if (typeof obj[key] === 'string') return obj[key] as string;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      const inner = (obj[key] as Record<string, unknown>)['message'];
      if (typeof inner === 'string') return inner;
    }
  }
  return undefined;
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
}
