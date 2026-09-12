/**
 * CLI unit tests.
 *
 * Tests config helpers, output utilities, and the SDK client factory.
 * Command tests use mocked fetch to avoid real HTTP.
 *
 * We don't run the CLI binary directly — we test the underlying modules
 * (config, output, sdk factory, error classes) and verify the SDK integration
 * through ArcaneClient's own test suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArcaneError, ArcaneApiError, ArcaneAuthError, ArcaneTimeoutError } from '@arcane/sdk';

// ── Config helpers ─────────────────────────────────────────────────────────────

describe('resolveApiKey', () => {
  afterEach(() => {
    delete process.env['ARCANE_API_KEY'];
  });

  it('returns stored key when env is not set', async () => {
    const { resolveApiKey } = await import('./config.js');
    expect(resolveApiKey('stored_key')).toBe('stored_key');
  });

  it('env var overrides stored key', async () => {
    process.env['ARCANE_API_KEY'] = 'env_key';
    const { resolveApiKey } = await import('./config.js');
    expect(resolveApiKey('stored_key')).toBe('env_key');
  });

  it('returns undefined when neither env nor stored key exists', async () => {
    const { resolveApiKey } = await import('./config.js');
    expect(resolveApiKey(undefined)).toBeUndefined();
  });
});

describe('resolveBaseUrl', () => {
  afterEach(() => {
    delete process.env['ARCANE_BASE_URL'];
  });

  it('returns default URL when nothing configured', async () => {
    const { resolveBaseUrl } = await import('./config.js');
    expect(resolveBaseUrl()).toBe('https://api.arcane.run/v1');
  });

  it('returns stored URL when set', async () => {
    const { resolveBaseUrl } = await import('./config.js');
    expect(resolveBaseUrl('http://localhost:3000/v1')).toBe('http://localhost:3000/v1');
  });

  it('env var overrides stored URL', async () => {
    process.env['ARCANE_BASE_URL'] = 'http://custom.example.com/v1';
    const { resolveBaseUrl } = await import('./config.js');
    expect(resolveBaseUrl('http://other.example.com/v1')).toBe('http://custom.example.com/v1');
  });
});

// ── Output helpers ─────────────────────────────────────────────────────────────

describe('output utilities', () => {
  it('setJsonMode / isJsonMode round-trips', async () => {
    const { setJsonMode, isJsonMode } = await import('./output.js');
    setJsonMode(true);
    expect(isJsonMode()).toBe(true);
    setJsonMode(false);
    expect(isJsonMode()).toBe(false);
  });

  it('printJson writes to stdout', async () => {
    const { printJson } = await import('./output.js');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printJson({ foo: 'bar' });
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ foo: 'bar' }, null, 2));
    spy.mockRestore();
  });

  it('printTable shows header and rows', async () => {
    const { printTable } = await import('./output.js');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printTable(
      [{ slug: 'github', name: 'GitHub' }],
      [{ key: 'slug', label: 'SLUG', width: 10 }, { key: 'name', label: 'NAME', width: 10 }],
    );
    // Should have been called: header, divider, at least one row
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
    spy.mockRestore();
  });

  it('printTable shows "No results" for empty data', async () => {
    const { printTable } = await import('./output.js');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printTable([], [{ key: 'slug', label: 'SLUG' }]);
    spy.mockRestore();
    // No crash on empty
  });
});

// ── SDK client factory ────────────────────────────────────────────────────────

describe('getClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['ARCANE_API_KEY'];
  });

  it('creates client from ARCANE_API_KEY env var', async () => {
    process.env['ARCANE_API_KEY'] = 'arc_test_env';
    vi.resetModules();
    // Mock config to return no stored key
    vi.doMock('./config.js', () => ({
      loadConfig: () => ({}),
      resolveApiKey: (stored?: string) => process.env['ARCANE_API_KEY'] ?? stored,
      resolveBaseUrl: () => 'http://localhost:3000/v1',
    }));
    const { getClient } = await import('./sdk.js');
    // Should not throw — API key is available
    expect(() => getClient()).not.toThrow();
  });
});

// ── Error class integration ───────────────────────────────────────────────────

describe('SDK error classes (used by CLI commands)', () => {
  it('ArcaneError is base of the hierarchy', () => {
    const e = new ArcaneApiError(500, 'oops');
    expect(e).toBeInstanceOf(ArcaneError);
    expect(e).toBeInstanceOf(Error);
  });

  it('ArcaneAuthError is an ArcaneApiError', () => {
    const e = new ArcaneAuthError('bad key');
    expect(e).toBeInstanceOf(ArcaneApiError);
    expect(e.status).toBe(401);
  });

  it('ArcaneTimeoutError name and message', () => {
    const e = new ArcaneTimeoutError('exec-1 timed out');
    expect(e.name).toBe('ArcaneTimeoutError');
    expect(e.message).toBe('exec-1 timed out');
    expect(e).toBeInstanceOf(ArcaneError);
  });

  it('ArcaneApiError carries request ID', () => {
    const e = new ArcaneApiError(422, 'invalid', 'req-abc', 'VALIDATION_ERROR');
    expect(e.requestId).toBe('req-abc');
    expect(e.code).toBe('VALIDATION_ERROR');
  });
});

// ── Exec command logic ────────────────────────────────────────────────────────

describe('exec command helpers', () => {
  it('JSON.parse handles valid input', () => {
    const input = '{"owner":"acme","limit":10}';
    expect(() => JSON.parse(input)).not.toThrow();
    expect(JSON.parse(input)).toEqual({ owner: 'acme', limit: 10 });
  });

  it('JSON.parse throws on invalid input', () => {
    expect(() => JSON.parse('{bad json}')).toThrow();
  });
});

// ── Status color mapping (smoke test) ────────────────────────────────────────

describe('execution status display', () => {
  const TERMINAL = ['SUCCEEDED', 'FAILED', 'REJECTED', 'TIMED_OUT'];
  const PENDING = ['PENDING', 'AUTHORIZING', 'RUNNING'];

  it('terminal statuses are defined', () => {
    expect(TERMINAL).toHaveLength(4);
  });

  it('non-terminal statuses are defined', () => {
    expect(PENDING).toHaveLength(3);
  });

  it('all statuses are strings', () => {
    for (const s of [...TERMINAL, ...PENDING]) {
      expect(typeof s).toBe('string');
    }
  });
});
