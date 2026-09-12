/**
 * HMAC signature verification for inbound webhooks.
 *
 * Each provider uses a different signing scheme. We support:
 *   github   — "sha256=<hex>" in X-Hub-Signature-256
 *   stripe   — "t=<ts>,v1=<hex>" in Stripe-Signature
 *   generic  — "sha256=<hex>" in X-Arcane-Signature
 *
 * All comparisons use timingSafeEqual to prevent timing attacks.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export type SigningScheme = 'github' | 'stripe' | 'generic';

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify an inbound webhook signature.
 *
 * @param body     Raw request body bytes
 * @param secret   Signing secret (plain text — resolved from SecretManager by caller)
 * @param header   The raw signature header value
 * @param scheme   Which signing scheme the provider uses
 * @param tsNowMs  Current time in ms — used for Stripe replay-window check (default: Date.now())
 */
export function verifySignature(
  body: Buffer,
  secret: string,
  header: string,
  scheme: SigningScheme,
  tsNowMs: number = Date.now(),
): VerifyResult {
  if (!header) return { valid: false, reason: 'missing_header' };
  if (!secret) return { valid: false, reason: 'missing_secret' };

  try {
    switch (scheme) {
      case 'github':
        return verifyGithub(body, secret, header);
      case 'stripe':
        return verifyStripe(body, secret, header, tsNowMs);
      case 'generic':
      default:
        return verifyGeneric(body, secret, header);
    }
  } catch {
    return { valid: false, reason: 'verification_error' };
  }
}

// ── GitHub: X-Hub-Signature-256: sha256=<hex> ─────────────────────────────────

function verifyGithub(body: Buffer, secret: string, header: string): VerifyResult {
  if (!header.startsWith('sha256=')) {
    return { valid: false, reason: 'invalid_format' };
  }
  const expected = computeHmacHex(body, secret);
  const provided = header.slice(7); // strip "sha256="
  return safeCompareHex(expected, provided);
}

// ── Stripe: Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>...] ────────────────

const STRIPE_REPLAY_WINDOW_MS = 5 * 60 * 1_000; // 5 minutes

function verifyStripe(
  body: Buffer,
  secret: string,
  header: string,
  tsNowMs: number,
): VerifyResult {
  const parts = header.split(',');
  let timestamp: string | undefined;
  const signatures: string[] = [];

  for (const part of parts) {
    if (part.startsWith('t=')) timestamp = part.slice(2);
    else if (part.startsWith('v1=')) signatures.push(part.slice(3));
  }

  if (!timestamp || signatures.length === 0) {
    return { valid: false, reason: 'invalid_format' };
  }

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return { valid: false, reason: 'invalid_timestamp' };

  const ageMs = tsNowMs - ts * 1000;
  if (ageMs > STRIPE_REPLAY_WINDOW_MS || ageMs < -60_000) {
    return { valid: false, reason: 'replay_window_exceeded' };
  }

  const signedPayload = Buffer.from(`${timestamp}.${body.toString('utf8')}`, 'utf8');
  const expected = computeHmacHex(signedPayload, secret);

  for (const sig of signatures) {
    const result = safeCompareHex(expected, sig);
    if (result.valid) return { valid: true };
  }
  return { valid: false, reason: 'signature_mismatch' };
}

// ── Generic: X-Arcane-Signature: sha256=<hex> ────────────────────────────────

function verifyGeneric(body: Buffer, secret: string, header: string): VerifyResult {
  const hex = header.startsWith('sha256=') ? header.slice(7) : header;
  const expected = computeHmacHex(body, secret);
  return safeCompareHex(expected, hex);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeHmacHex(data: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

function safeCompareHex(expected: string, provided: string): VerifyResult {
  if (expected.length !== provided.length) {
    return { valid: false, reason: 'signature_mismatch' };
  }
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(provided, 'hex');
  if (a.length !== b.length) return { valid: false, reason: 'signature_mismatch' };
  const ok = timingSafeEqual(a, b);
  return ok ? { valid: true } : { valid: false, reason: 'signature_mismatch' };
}
