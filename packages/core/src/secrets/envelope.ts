/**
 * Envelope encryption primitives — AES-256-GCM.
 *
 * Each secret is encrypted with a unique data-encryption key (DEK).
 * The DEK is itself encrypted by the key-encryption key (KEK) from the KMS backend.
 *
 * Wire format (base64url-encoded JSON envelope):
 * {
 *   "v":  1,               // schema version
 *   "alg": "A256GCM",      // algorithm
 *   "dek": "<base64>",     // encrypted DEK (ciphertext from KMS)
 *   "iv":  "<base64>",     // 12-byte GCM IV for the payload
 *   "ct":  "<base64>",     // ciphertext payload
 *   "tag": "<base64>"      // 16-byte GCM auth tag
 * }
 *
 * SECURITY NOTES:
 * - Never reuse IV with the same key — each encrypt() call generates a fresh random IV.
 * - Auth tag is verified before any plaintext is returned (GCM guarantees this).
 * - The envelope is opaque — callers store and return it as a string (secret_reference).
 * - Plaintext never appears in logs, errors, or DB columns (only secret_reference does).
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALG = 'aes-256-gcm' as const;
const TAG_LENGTH = 16; // bytes
const IV_LENGTH = 12;  // bytes — 96-bit recommended for GCM

export interface SealedEnvelope {
  v: 1;
  alg: 'A256GCM';
  /** Base64: encrypted DEK bytes (output of KMS encrypt) */
  dek: string;
  /** Base64: 12-byte IV */
  iv: string;
  /** Base64: ciphertext */
  ct: string;
  /** Base64: 16-byte GCM auth tag */
  tag: string;
}

/**
 * Encrypt plaintext with a raw 32-byte DEK.
 * Returns a SealedEnvelope with a fresh random IV every call.
 */
export function encryptWithDek(
  plaintext: string,
  dek: Buffer,
  encryptedDek: Buffer,
): SealedEnvelope {
  if (dek.length !== 32) {
    throw new Error(`DEK must be 32 bytes, got ${dek.length}`);
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALG, dek, iv, { authTagLength: TAG_LENGTH });

  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    v: 1,
    alg: 'A256GCM',
    dek: encryptedDek.toString('base64'),
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt a SealedEnvelope using the raw DEK.
 * Throws if authentication fails (tampered ciphertext or wrong key).
 */
export function decryptWithDek(envelope: SealedEnvelope, dek: Buffer): string {
  const iv = Buffer.from(envelope.iv, 'base64');
  const ct = Buffer.from(envelope.ct, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');

  const decipher = createDecipheriv(ALG, dek, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Serialize a SealedEnvelope to a compact base64url string for DB storage.
 */
export function serializeEnvelope(envelope: SealedEnvelope): string {
  return Buffer.from(JSON.stringify(envelope)).toString('base64url');
}

/**
 * Deserialize and validate a base64url envelope string.
 * Throws if the string is malformed or has an unexpected version/alg.
 */
export function deserializeEnvelope(serialized: string): SealedEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(serialized, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid envelope: not valid base64url-encoded JSON');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as Record<string, unknown>)['v'] !== 1 ||
    (parsed as Record<string, unknown>)['alg'] !== 'A256GCM'
  ) {
    throw new Error('Invalid envelope: unexpected version or algorithm');
  }

  return parsed as SealedEnvelope;
}
