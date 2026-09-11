/**
 * KMS backend interface — the key-encryption key (KEK) layer.
 *
 * Each backend can encrypt/decrypt a 32-byte DEK using its own KEK storage.
 * The local backend uses the SECRET_ENCRYPTION_KEY env var directly.
 * Cloud backends (AWS KMS, GCP KMS, OpenBao) call their respective APIs.
 *
 * Implementations must be:
 *   - Stateless beyond their config (safe to construct per-request if needed)
 *   - Never log the plaintext DEK or any plaintext secret
 *   - Idempotent: encrypt(decrypt(x)) = x
 */

export interface KmsBackend {
  /**
   * Encrypt a 32-byte DEK with the KEK.
   * Returns the encrypted DEK as a Buffer (to be stored in the envelope).
   */
  encryptDek(dek: Buffer): Promise<Buffer>;

  /**
   * Decrypt an encrypted DEK back to the 32-byte raw DEK.
   * Throws if decryption fails or the ciphertext is invalid.
   */
  decryptDek(encryptedDek: Buffer): Promise<Buffer>;
}
