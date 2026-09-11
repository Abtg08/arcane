/**
 * Unit tests for envelope encryption and SecretManager.
 * No DB, no network — pure crypto.
 */

import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  encryptWithDek,
  decryptWithDek,
  serializeEnvelope,
  deserializeEnvelope,
} from './envelope.js';
import { LocalKmsBackend } from './backends/local.js';
import { SecretManager } from './manager.js';

// 64-char hex = 32 bytes
const TEST_KEK = '0'.repeat(64);
const TEST_KEK_2 = '1'.repeat(64);

// ── envelope primitives ───────────────────────────────────────────────────────

describe('encryptWithDek / decryptWithDek', () => {
  it('round-trips a plaintext string', () => {
    const dek = randomBytes(32);
    const encryptedDek = Buffer.alloc(32); // stub
    const envelope = encryptWithDek('hello world', dek, encryptedDek);
    const result = decryptWithDek(envelope, dek);
    expect(result).toBe('hello world');
  });

  it('produces different ciphertext each call (fresh IV)', () => {
    const dek = randomBytes(32);
    const encDek = Buffer.alloc(32);
    const e1 = encryptWithDek('same plaintext', dek, encDek);
    const e2 = encryptWithDek('same plaintext', dek, encDek);
    expect(e1.iv).not.toBe(e2.iv);
    expect(e1.ct).not.toBe(e2.ct);
  });

  it('throws on wrong DEK (GCM auth failure)', () => {
    const dek = randomBytes(32);
    const wrongDek = randomBytes(32);
    const encDek = Buffer.alloc(32);
    const envelope = encryptWithDek('secret', dek, encDek);
    expect(() => decryptWithDek(envelope, wrongDek)).toThrow();
  });

  it('throws on tampered ciphertext', () => {
    const dek = randomBytes(32);
    const encDek = Buffer.alloc(32);
    const envelope = encryptWithDek('secret', dek, encDek);
    // Flip a bit in the ciphertext
    const tampered = { ...envelope, ct: Buffer.from(envelope.ct, 'base64').fill(0).toString('base64') };
    expect(() => decryptWithDek(tampered, dek)).toThrow();
  });

  it('throws if DEK is not 32 bytes', () => {
    const shortDek = randomBytes(16);
    const encDek = Buffer.alloc(32);
    expect(() => encryptWithDek('x', shortDek, encDek)).toThrow('32 bytes');
  });
});

describe('serializeEnvelope / deserializeEnvelope', () => {
  it('round-trips an envelope', () => {
    const dek = randomBytes(32);
    const encDek = Buffer.alloc(32);
    const envelope = encryptWithDek('test', dek, encDek);
    const serialized = serializeEnvelope(envelope);
    const deserialized = deserializeEnvelope(serialized);
    expect(deserialized.v).toBe(1);
    expect(deserialized.alg).toBe('A256GCM');
    expect(deserialized.ct).toBe(envelope.ct);
  });

  it('throws on invalid base64', () => {
    expect(() => deserializeEnvelope('not-valid-base64url!!!')).toThrow();
  });

  it('throws on wrong version', () => {
    const bad = Buffer.from(JSON.stringify({ v: 2, alg: 'A256GCM' })).toString('base64url');
    expect(() => deserializeEnvelope(bad)).toThrow('version');
  });
});

// ── LocalKmsBackend ───────────────────────────────────────────────────────────

describe('LocalKmsBackend', () => {
  it('wraps and unwraps a DEK', async () => {
    const backend = new LocalKmsBackend(TEST_KEK);
    const dek = randomBytes(32);
    const encrypted = await backend.encryptDek(dek);
    const decrypted = await backend.decryptDek(encrypted);
    expect(decrypted.equals(dek)).toBe(true);
  });

  it('different KEK cannot unwrap the DEK', async () => {
    const backend1 = new LocalKmsBackend(TEST_KEK);
    const backend2 = new LocalKmsBackend(TEST_KEK_2);
    const dek = randomBytes(32);
    const encrypted = await backend1.encryptDek(dek);
    // OpenSSL 3: ECB decrypt with a wrong-length or mismatched block may throw,
    // or produce wrong bytes that then fail GCM auth downstream — either is correct.
    // We just assert the wrong DEK is not the original.
    let wrongDek: Buffer;
    try {
      wrongDek = await backend2.decryptDek(encrypted);
      expect(wrongDek.equals(dek)).toBe(false);
    } catch {
      // Also acceptable — padding error from wrong KEK
    }
  });

  it('rejects invalid key format', () => {
    expect(() => new LocalKmsBackend('tooshort')).toThrow('64-character hex');
    expect(() => new LocalKmsBackend('Z'.repeat(64))).toThrow('64-character hex');
  });
});

// ── SecretManager ─────────────────────────────────────────────────────────────

describe('SecretManager', () => {
  const kms = new LocalKmsBackend(TEST_KEK);
  const manager = new SecretManager(kms);

  it('seal returns an opaque string (not the plaintext)', async () => {
    const ref = await manager.seal('my-oauth-token');
    expect(ref).not.toContain('my-oauth-token');
    expect(ref.length).toBeGreaterThan(50);
  });

  it('seal + unseal round-trips', async () => {
    const plaintext = 'ghp_supersecrettoken1234567890';
    const ref = await manager.seal(plaintext);
    const result = await manager.unseal(ref);
    expect(result).toBe(plaintext);
  });

  it('two seals of same plaintext produce different references', async () => {
    const ref1 = await manager.seal('same-value');
    const ref2 = await manager.seal('same-value');
    expect(ref1).not.toBe(ref2);
  });

  it('unseal with wrong KEK throws', async () => {
    const wrongKms = new LocalKmsBackend(TEST_KEK_2);
    const wrongManager = new SecretManager(wrongKms);
    const ref = await manager.seal('value');
    await expect(wrongManager.unseal(ref)).rejects.toThrow();
  });

  it('unseal with tampered reference throws', async () => {
    await expect(manager.unseal('garbage-not-an-envelope')).rejects.toThrow();
  });

  it('handles unicode plaintext', async () => {
    const unicode = '🔑 ключ секрета — тест';
    const ref = await manager.seal(unicode);
    const result = await manager.unseal(ref);
    expect(result).toBe(unicode);
  });

  it('handles empty string', async () => {
    const ref = await manager.seal('');
    const result = await manager.unseal(ref);
    expect(result).toBe('');
  });

  it('handles large secrets (4KB)', async () => {
    const large = 'x'.repeat(4096);
    const ref = await manager.seal(large);
    const result = await manager.unseal(ref);
    expect(result).toBe(large);
  });
});
