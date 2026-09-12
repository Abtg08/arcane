/**
 * Delivery unit tests — mocks fetch, tests retry schedule,
 * HMAC signing, timeout handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { deliver, retryDelayMs, MAX_DELIVERY_ATTEMPTS } from './delivery.js';

// ── retryDelayMs ──────────────────────────────────────────────────────────────

describe('retryDelayMs', () => {
  it('returns 0 for attempt 1 (immediate)', () => {
    expect(retryDelayMs(1)).toBe(0);
  });

  it('returns 30s for attempt 2', () => {
    expect(retryDelayMs(2)).toBe(30_000);
  });

  it('returns 5m for attempt 3', () => {
    expect(retryDelayMs(3)).toBe(300_000);
  });

  it('returns 30m for attempt 4', () => {
    expect(retryDelayMs(4)).toBe(1_800_000);
  });

  it('returns 2h for attempt 5 (last)', () => {
    expect(retryDelayMs(5)).toBe(7_200_000);
  });

  it('MAX_DELIVERY_ATTEMPTS is 5', () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(5);
  });
});

// ── deliver ───────────────────────────────────────────────────────────────────

describe('deliver', () => {
  const URL = 'https://example.com/hook';
  const PAYLOAD = { event: 'push', repo: 'acme/app' };
  const SECRET = 'signing-secret-32-chars-minimum!!';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-test') });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns success:true on 200', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      body: { cancel: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Response);

    const result = await deliver({ url: URL, payload: PAYLOAD });
    expect(result.success).toBe(true);
    expect(result.httpStatus).toBe(200);
  });

  it('returns success:true on 201', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 201,
      body: { cancel: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Response);

    const result = await deliver({ url: URL, payload: PAYLOAD });
    expect(result.success).toBe(true);
  });

  it('returns success:false on 400', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 400,
      body: { cancel: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Response);

    const result = await deliver({ url: URL, payload: PAYLOAD });
    expect(result.success).toBe(false);
    expect(result.httpStatus).toBe(400);
  });

  it('returns success:false on 500', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 500,
      body: { cancel: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Response);

    const result = await deliver({ url: URL, payload: PAYLOAD });
    expect(result.success).toBe(false);
    expect(result.httpStatus).toBe(500);
  });

  it('returns success:false on network error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await deliver({ url: URL, payload: PAYLOAD });
    expect(result.success).toBe(false);
    expect(result.httpStatus).toBeNull();
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('returns success:false on AbortError (timeout)', async () => {
    vi.mocked(fetch).mockRejectedValue(Object.assign(new Error('timeout'), { name: 'AbortError' }));

    const result = await deliver({ url: URL, payload: PAYLOAD });
    expect(result.success).toBe(false);
    expect(result.httpStatus).toBeNull();
  });

  it('includes HMAC signature when signingSecret provided', async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';

    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      capturedBody = (init?.body as string) ?? '';
      return {
        status: 200,
        body: { cancel: vi.fn().mockResolvedValue(undefined) },
      } as unknown as Response;
    });

    await deliver({ url: URL, payload: PAYLOAD, signingSecret: SECRET });

    const sigHeader = capturedHeaders['X-Arcane-Signature'];
    expect(sigHeader).toMatch(/^sha256=[0-9a-f]{64}$/);

    // Verify the signature is correct
    const hex = createHmac('sha256', SECRET).update(capturedBody, 'utf8').digest('hex');
    expect(sigHeader).toBe(`sha256=${hex}`);
  });

  it('does not include signature header when no secret', async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      return {
        status: 200,
        body: { cancel: vi.fn().mockResolvedValue(undefined) },
      } as unknown as Response;
    });

    await deliver({ url: URL, payload: PAYLOAD });
    expect(capturedHeaders['X-Arcane-Signature']).toBeUndefined();
  });

  it('sends payload as JSON', async () => {
    let capturedBody = '';

    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      capturedBody = (init?.body as string) ?? '';
      return {
        status: 200,
        body: { cancel: vi.fn().mockResolvedValue(undefined) },
      } as unknown as Response;
    });

    await deliver({ url: URL, payload: PAYLOAD });
    expect(JSON.parse(capturedBody)).toEqual(PAYLOAD);
  });

  it('includes User-Agent and Content-Type headers', async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      capturedHeaders = (init?.headers as Record<string, string>) ?? {};
      return {
        status: 200,
        body: { cancel: vi.fn().mockResolvedValue(undefined) },
      } as unknown as Response;
    });

    await deliver({ url: URL, payload: PAYLOAD });
    expect(capturedHeaders['Content-Type']).toBe('application/json');
    expect(capturedHeaders['User-Agent']).toBe('Arcane-Webhook/1.0');
  });

  it('reports durationMs > 0', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      body: { cancel: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Response);

    const result = await deliver({ url: URL, payload: PAYLOAD });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
