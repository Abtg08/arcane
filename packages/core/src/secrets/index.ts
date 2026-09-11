export { SecretManager, createSecretManager } from './manager.js';
export type { KmsBackend } from './backends/types.js';
export { LocalKmsBackend } from './backends/local.js';
export {
  encryptWithDek,
  decryptWithDek,
  serializeEnvelope,
  deserializeEnvelope,
} from './envelope.js';
export type { SealedEnvelope } from './envelope.js';
