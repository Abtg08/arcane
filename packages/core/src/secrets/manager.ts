/**
 * SecretManager — the single entry point for all secret operations.
 *
 * Responsibilities:
 *   seal(plaintext)    → secret_reference (opaque string stored in DB)
 *   unseal(reference)  → plaintext (ONLY inside connector-runtime — SI-02)
 *
 * Each seal() call:
 *   1. Generates a fresh 32-byte random DEK
 *   2. Encrypts the DEK with the KMS backend (KEK wrapping)
 *   3. Encrypts the plaintext with AES-256-GCM using the DEK
 *   4. Returns a base64url envelope containing: encrypted DEK + IV + CT + tag
 *
 * The returned secret_reference is the ONLY thing stored in the database.
 * Plaintext NEVER touches the DB. (SI-03: secret_reference ≠ secret)
 *
 * IMPORTANT (SI-02): unseal() should only be called from connector-runtime.
 * The API and MCP gateway receive and store secret_reference — never the
 * plaintext credential.
 */

import { randomBytes } from 'node:crypto';
import {
  encryptWithDek,
  decryptWithDek,
  serializeEnvelope,
  deserializeEnvelope,
} from './envelope.js';
import type { KmsBackend } from './backends/types.js';
import { InternalError } from '../errors/index.js';

export class SecretManager {
  constructor(private readonly kms: KmsBackend) {}

  /**
   * Seal a plaintext secret into an opaque secret_reference.
   *
   * @param plaintext — the raw credential (token, API key, etc.)
   * @returns secret_reference — store this in the DB, never the plaintext
   */
  async seal(plaintext: string): Promise<string> {
    try {
      // 1. Fresh DEK for this secret
      const dek = randomBytes(32);

      // 2. Wrap DEK with KEK via KMS backend
      const encryptedDek = await this.kms.encryptDek(dek);

      // 3. Encrypt plaintext with DEK
      const envelope = encryptWithDek(plaintext, dek, encryptedDek);

      // 4. Serialize to opaque string
      return serializeEnvelope(envelope);
    } catch (err) {
      // Never leak plaintext in error messages
      throw new InternalError(
        'Secret encryption failed',
        err,
      );
    }
  }

  /**
   * Unseal a secret_reference back to plaintext.
   *
   * SI-02: Only connector-runtime should call this.
   *
   * @param secretReference — the opaque string from the DB
   * @returns plaintext credential
   */
  async unseal(secretReference: string): Promise<string> {
    try {
      // 1. Deserialize envelope
      const envelope = deserializeEnvelope(secretReference);

      // 2. Unwrap DEK via KMS backend
      const encryptedDek = Buffer.from(envelope.dek, 'base64');
      const dek = await this.kms.decryptDek(encryptedDek);

      // 3. Decrypt payload with DEK (GCM auth tag verified here)
      return decryptWithDek(envelope, dek);
    } catch (err) {
      // Never include the secret_reference in error messages
      throw new InternalError(
        'Secret decryption failed',
        err,
      );
    }
  }
}

/**
 * Factory: create a SecretManager from config values.
 * Keeps import surface small — callers don't need to know about backends.
 */
export async function createSecretManager(config: {
  SECRET_BACKEND: 'local' | 'aws-kms' | 'gcp-kms' | 'openbao';
  SECRET_ENCRYPTION_KEY: string;
  KMS_KEY_ID?: string;
}): Promise<SecretManager> {
  switch (config.SECRET_BACKEND) {
    case 'local': {
      const { LocalKmsBackend } = await import('./backends/local.js');
      return new SecretManager(new LocalKmsBackend(config.SECRET_ENCRYPTION_KEY));
    }
    case 'aws-kms':
    case 'gcp-kms':
    case 'openbao':
      // Phase 3+: implement cloud KMS backends
      throw new InternalError(
        `KMS backend '${config.SECRET_BACKEND}' not yet implemented. Use SECRET_BACKEND=local for now.`,
      );
    default: {
      const _exhaustive: never = config.SECRET_BACKEND;
      throw new InternalError(`Unknown SECRET_BACKEND: ${String(_exhaustive)}`);
    }
  }
}
