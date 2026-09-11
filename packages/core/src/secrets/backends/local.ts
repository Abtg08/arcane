/**
 * Local KMS backend — for development and single-node deployments.
 *
 * Uses SECRET_ENCRYPTION_KEY (64-char hex = 32 bytes) as the KEK directly.
 * The DEK is XOR-wrapped with the KEK (simple but deterministic — use cloud
 * KMS in production for true key isolation and rotation).
 *
 * In production: swap this for AwsKmsBackend or OpenBaoBackend — the
 * SecretManager interface stays the same, only the backend changes.
 *
 * SECURITY: The KEK never leaves this process. The encrypted DEK stored in
 * the envelope is only recoverable by a process that holds the same KEK.
 */

import { createCipheriv, createDecipheriv } from 'node:crypto';
import type { KmsBackend } from './types.js';

const WRAP_ALG = 'aes-256-ecb' as const;

export class LocalKmsBackend implements KmsBackend {
  private readonly kek: Buffer;

  constructor(secretEncryptionKey: string) {
    if (!/^[0-9a-fA-F]{64}$/.test(secretEncryptionKey)) {
      throw new Error(
        'SECRET_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
      );
    }
    this.kek = Buffer.from(secretEncryptionKey, 'hex');
  }

  async encryptDek(dek: Buffer): Promise<Buffer> {
    // AES-256-ECB key wrap (RFC 3394 simplified for local use)
    // ECB is acceptable here because DEKs are always exactly 32 bytes (one block × 2)
    const cipher = createCipheriv(WRAP_ALG, this.kek, null);
    return Buffer.concat([cipher.update(dek), cipher.final()]);
  }

  async decryptDek(encryptedDek: Buffer): Promise<Buffer> {
    const decipher = createDecipheriv(WRAP_ALG, this.kek, null);
    return Buffer.concat([decipher.update(encryptedDek), decipher.final()]);
  }
}
