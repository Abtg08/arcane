/**
 * HMAC signature verification tests.
 * Tests all three signing schemes: github, stripe, generic.
 * Covers: valid signature, wrong secret, tampered body, missing header,
 *         Stripe replay window, empty inputs.
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySignature } from './hmac.js';

const SECRET = 'test-signing-secret-min-32-chars!';
const BODY = Buffer.from(JSON.stringify({ action: 'opened', number: 42 }), 'utf8');

function githubSig(body: Buffer, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

function genericSig(body: Buffer, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

function stripeSig(body: Buffer, secret: string, tsSeconds: number): string {
  const signed = Buffer.from(`${tsSeconds}.${body.toString('utf8')}`, 'utf8');
  const v1 = createHmac('sha256', secret).update(signed).digest('hex');
  return `t=${tsSeconds},v1=${v1}`;
}

// ── GitHub scheme ─────────────────────────────────────────────────────────────

describe('verifySignature — github', () => {
  it('accepts a valid signature', () => {
    const sig = githubSig(BODY, SECRET);
    expect(verifySignature(BODY, SECRET, sig, 'github').valid).toBe(true);
  });

  it('rejects wrong secret', () => {
    const sig = githubSig(BODY, 'wrong-secret');
    const result = verifySignature(BODY, SECRET, sig, 'github');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects tampered body', () => {
    const sig = githubSig(BODY, SECRET);
    const tampered = Buffer.from('{"action":"closed","number":42}', 'utf8');
    expect(verifySignature(tampered, SECRET, sig, 'github').valid).toBe(false);
  });

  it('rejects missing header', () => {
    const result = verifySignature(BODY, SECRET, '', 'github');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing_header');
  });

  it('rejects header without sha256= prefix', () => {
    const hex = createHmac('sha256', SECRET).update(BODY).digest('hex');
    const result = verifySignature(BODY, SECRET, hex, 'github');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_format');
  });

  it('rejects empty body + valid sig of empty body', () => {
    const emptyBody = Buffer.alloc(0);
    const sig = githubSig(emptyBody, SECRET);
    // Valid sig for empty body should succeed
    expect(verifySignature(emptyBody, SECRET, sig, 'github').valid).toBe(true);
  });

  it('rejects empty secret', () => {
    const sig = githubSig(BODY, SECRET);
    const result = verifySignature(BODY, '', sig, 'github');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing_secret');
  });
});

// ── Stripe scheme ─────────────────────────────────────────────────────────────

describe('verifySignature — stripe', () => {
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);

  it('accepts a valid signature within replay window', () => {
    const sig = stripeSig(BODY, SECRET, nowSec);
    expect(verifySignature(BODY, SECRET, sig, 'stripe', nowMs).valid).toBe(true);
  });

  it('rejects signature outside replay window (too old)', () => {
    const oldSec = Math.floor((nowMs - 6 * 60 * 1000) / 1000); // 6 minutes ago
    const sig = stripeSig(BODY, SECRET, oldSec);
    const result = verifySignature(BODY, SECRET, sig, 'stripe', nowMs);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('replay_window_exceeded');
  });

  it('rejects signature from the future (> 60s ahead)', () => {
    const futureSec = Math.floor((nowMs + 90 * 1000) / 1000); // 90s in future
    const sig = stripeSig(BODY, SECRET, futureSec);
    const result = verifySignature(BODY, SECRET, sig, 'stripe', nowMs);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('replay_window_exceeded');
  });

  it('rejects wrong secret', () => {
    const sig = stripeSig(BODY, 'wrong', nowSec);
    const result = verifySignature(BODY, SECRET, sig, 'stripe', nowMs);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects malformed header', () => {
    const result = verifySignature(BODY, SECRET, 'not-a-stripe-sig', 'stripe', nowMs);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('invalid_format');
  });

  it('accepts when multiple v1 signatures present and one matches', () => {
    const goodSig = createHmac('sha256', SECRET)
      .update(Buffer.from(`${nowSec}.${BODY.toString('utf8')}`, 'utf8'))
      .digest('hex');
    const header = `t=${nowSec},v1=badhex000000000000000000000000000000000000000000000000000000000000,v1=${goodSig}`;
    expect(verifySignature(BODY, SECRET, header, 'stripe', nowMs).valid).toBe(true);
  });
});

// ── Generic scheme ────────────────────────────────────────────────────────────

describe('verifySignature — generic', () => {
  it('accepts valid sha256= prefixed header', () => {
    const sig = genericSig(BODY, SECRET);
    expect(verifySignature(BODY, SECRET, sig, 'generic').valid).toBe(true);
  });

  it('accepts raw hex header without prefix', () => {
    const hex = createHmac('sha256', SECRET).update(BODY).digest('hex');
    expect(verifySignature(BODY, SECRET, hex, 'generic').valid).toBe(true);
  });

  it('rejects wrong secret', () => {
    const sig = genericSig(BODY, 'wrong');
    expect(verifySignature(BODY, SECRET, sig, 'generic').valid).toBe(false);
  });

  it('rejects empty header', () => {
    expect(verifySignature(BODY, SECRET, '', 'generic').valid).toBe(false);
  });
});
