/**
 * Unit tests for connector-runtime pure functions.
 * No NATS, no DB, no HTTP — pure logic only.
 */

import { describe, it, expect } from 'vitest';
import { stripCredentialKeys, sanitizeResponse } from './response-sanitizer.js';
import * as ssrfModule from './ssrf.js';
const { buildSsrfGuard, assertSsrfSafe, SsrfError } = ssrfModule;

// ── Response sanitizer ────────────────────────────────────────────────────────

describe('stripCredentialKeys', () => {
  it('strips top-level credential keys', () => {
    const input = {
      id: '123',
      name: 'repo',
      access_token: 'ghp_secret',
      password: 'hunter2',
    };
    const result = stripCredentialKeys(input) as Record<string, unknown>;
    expect(result['id']).toBe('123');
    expect(result['name']).toBe('repo');
    expect(result['access_token']).toBe('[REDACTED]');
    expect(result['password']).toBe('[REDACTED]');
  });

  it('strips nested credential keys', () => {
    const input = {
      data: {
        user: { api_key: 'secret123', email: 'x@example.com' },
      },
    };
    const result = stripCredentialKeys(input) as Record<string, Record<string, Record<string, unknown>>>;
    expect(result['data']?.['user']?.['api_key']).toBe('[REDACTED]');
    expect(result['data']?.['user']?.['email']).toBe('x@example.com');
  });

  it('handles arrays correctly', () => {
    const input = [{ token: 'abc', name: 'x' }, { token: 'def', name: 'y' }];
    const result = stripCredentialKeys(input) as Array<Record<string, unknown>>;
    expect(result[0]?.['token']).toBe('[REDACTED]');
    expect(result[0]?.['name']).toBe('x');
    expect(result[1]?.['token']).toBe('[REDACTED]');
  });

  it('passes through primitives unchanged', () => {
    expect(stripCredentialKeys('hello')).toBe('hello');
    expect(stripCredentialKeys(42)).toBe(42);
    expect(stripCredentialKeys(null)).toBeNull();
    expect(stripCredentialKeys(true)).toBe(true);
  });

  it('handles empty object', () => {
    expect(stripCredentialKeys({})).toEqual({});
  });

  it('is case-insensitive for key matching', () => {
    const input = { Authorization: 'Bearer secret', Api_Key: 'key' };
    // Key matching is case-insensitive via toLowerCase()
    const result = stripCredentialKeys(input) as Record<string, unknown>;
    expect(result['Authorization']).toBe('[REDACTED]');
  });
});

describe('sanitizeResponse', () => {
  const schema = {};

  it('returns output for 2xx responses', () => {
    const result = sanitizeResponse(200, { id: 1, name: 'main' }, schema);
    expect(result.error).toBeNull();
    expect(result.output).toEqual({ id: 1, name: 'main' });
  });

  it('returns error for 4xx responses', () => {
    const result = sanitizeResponse(404, { message: 'Not found' }, schema);
    expect(result.output).toBeNull();
    expect(result.error?.code).toBe('PROVIDER_HTTP_404');
    expect(result.error?.message).toContain('Not found');
  });

  it('returns error for 5xx responses', () => {
    const result = sanitizeResponse(503, { error: 'Service unavailable' }, schema);
    expect(result.output).toBeNull();
    expect(result.error?.code).toBe('PROVIDER_HTTP_503');
  });

  it('strips credentials from successful responses', () => {
    const result = sanitizeResponse(200, { repo: 'arcane', access_token: 'leaked!' }, schema);
    expect(result.error).toBeNull();
    expect((result.output as Record<string, unknown>)['access_token']).toBe('[REDACTED]');
  });

  it('wraps array responses in { result }', () => {
    const result = sanitizeResponse(200, [1, 2, 3], schema);
    expect(result.output).toEqual({ result: [1, 2, 3] });
  });

  it('wraps primitive responses in { result }', () => {
    const result = sanitizeResponse(200, 'ok', schema);
    expect(result.output).toEqual({ result: 'ok' });
  });

  it('truncates long error messages', () => {
    const result = sanitizeResponse(400, { message: 'x'.repeat(1000) }, schema);
    expect(result.error?.message.length).toBeLessThanOrEqual(503); // 500 + ellipsis
  });
});

// ── SSRF guard ────────────────────────────────────────────────────────────────

describe('assertSsrfSafe', () => {
  const guard = buildSsrfGuard([
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '127.0.0.0/8',
  ]);

  it('rejects non-HTTP(S) protocols', async () => {
    await expect(assertSsrfSafe('ftp://example.com/file', guard)).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSsrfSafe('file:///etc/passwd', guard)).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects unparseable URLs', async () => {
    await expect(assertSsrfSafe('not a url', guard)).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects blocked hostnames (metadata endpoints)', async () => {
    await expect(
      assertSsrfSafe('http://metadata.google.internal/computeMetadata/v1/', guard),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects link-local (169.254.x.x) — always blocked', async () => {
    const orig = ssrfModule._dns.lookup;
    ssrfModule._dns.lookup = async () => [{ address: '169.254.169.254', family: 4 }] as never;
    const emptyGuard = buildSsrfGuard([]); // No config CIDRs — only ALWAYS_BLOCKED
    await expect(assertSsrfSafe('https://example.com', emptyGuard)).rejects.toBeInstanceOf(SsrfError);
    ssrfModule._dns.lookup = orig;
  });

  it('allows HTTPS to public domains (DNS mock)', async () => {
    const orig = ssrfModule._dns.lookup;
    ssrfModule._dns.lookup = async () => [{ address: '140.82.121.4', family: 4 }] as never;
    await expect(assertSsrfSafe('https://github.com', guard)).resolves.toBeUndefined();
    ssrfModule._dns.lookup = orig;
  });

  it('rejects when DNS resolves to private IP', async () => {
    const orig = ssrfModule._dns.lookup;
    ssrfModule._dns.lookup = async () => [{ address: '192.168.1.100', family: 4 }] as never;
    await expect(assertSsrfSafe('https://evil.internal', guard)).rejects.toBeInstanceOf(SsrfError);
    ssrfModule._dns.lookup = orig;
  });

  it('rejects when DNS resolves to loopback', async () => {
    const orig = ssrfModule._dns.lookup;
    ssrfModule._dns.lookup = async () => [{ address: '127.0.0.1', family: 4 }] as never;
    await expect(assertSsrfSafe('https://localhost.evil.com', guard)).rejects.toBeInstanceOf(SsrfError);
    ssrfModule._dns.lookup = orig;
  });

  it('rejects when DNS fails', async () => {
    const orig = ssrfModule._dns.lookup;
    ssrfModule._dns.lookup = async () => { throw new Error('ENOTFOUND'); };
    await expect(assertSsrfSafe('https://does-not-exist.example', guard)).rejects.toBeInstanceOf(SsrfError);
    ssrfModule._dns.lookup = orig;
  });
});
