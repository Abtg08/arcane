/**
 * HTTP delivery — sends an event payload to a webhook destination URL.
 *
 * Retry schedule (exponential backoff, jittered):
 *   Attempt 1: immediate
 *   Attempt 2: 30s
 *   Attempt 3: 5m
 *   Attempt 4: 30m
 *   Attempt 5: 2h
 *   After 5 failures: DEAD_LETTERED
 *
 * Signing:
 *   If the destination has a secret_reference, the payload is signed with
 *   HMAC-SHA256 and the signature sent in X-Arcane-Signature: sha256=<hex>.
 *
 * Security:
 *   - Timeout: 10s per attempt
 *   - Response body discarded (we only care about status code)
 *   - No sensitive data in delivery payload (SI-01 analogue)
 */

import { createHmac } from 'node:crypto';

export const MAX_DELIVERY_ATTEMPTS = 5;

/** Delay in ms before the nth retry (1-indexed attempt number) */
export function retryDelayMs(attemptNumber: number): number {
  const delays = [0, 30_000, 300_000, 1_800_000, 7_200_000]; // 0s, 30s, 5m, 30m, 2h
  return delays[attemptNumber - 1] ?? 7_200_000;
}

export interface DeliveryRequest {
  url: string;
  payload: Record<string, unknown>;
  /** Optional HMAC signing secret (plain text — resolved by caller) */
  signingSecret?: string;
  timeoutMs?: number;
}

export interface DeliveryResult {
  success: boolean;
  httpStatus: number | null;
  error?: string;
  durationMs: number;
}

/**
 * Deliver a webhook payload to a destination URL.
 * Returns result — never throws.
 */
export async function deliver(req: DeliveryRequest): Promise<DeliveryResult> {
  const { url, payload, signingSecret, timeoutMs = 10_000 } = req;
  const startMs = Date.now();

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Arcane-Webhook/1.0',
    'X-Arcane-Delivery': crypto.randomUUID(),
  };

  if (signingSecret) {
    const sig = createHmac('sha256', signingSecret).update(body, 'utf8').digest('hex');
    headers['X-Arcane-Signature'] = `sha256=${sig}`;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });

    // Discard response body — we only care about status
    await res.body?.cancel();

    const durationMs = Date.now() - startMs;
    const success = res.status >= 200 && res.status < 300;
    return { success, httpStatus: res.status, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, httpStatus: null, error, durationMs };
  }
}
