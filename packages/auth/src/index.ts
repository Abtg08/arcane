/**
 * @arcane/auth
 *
 * Authentication and authorization for the Arcane platform.
 *
 * - API key generation (SI-15: plaintext shown once, stored as sha256)
 * - API key validation (constant-time hash comparison)
 * - JWT issuance and verification (short-lived session tokens)
 * - OAuth state + PKCE management (SI-16)
 * - Valkey-backed per-key rate limiting (SI-14: fail open)
 * - Session validation with Valkey cache (SI-17)
 * - Fastify auth middleware plugin
 */

// API Keys
export {
  generateApiKey,
  hashApiKey,
  compareApiKeyHash,
  type GeneratedApiKey,
} from './apikey/generate.js';

export {
  validateApiKey,
  hasPermission,
  type ValidatedApiKey,
} from './apikey/validate.js';

// JWT / Session tokens
export {
  issueSessionToken,
  verifySessionToken,
  decodeTokenUnsafe,
  type SessionTokenPayload,
  type IssueTokenOptions,
} from './jwt/index.js';

// OAuth state + PKCE
export {
  generatePkceChallenge,
  createOAuthState,
  consumeOAuthState,
  verifyPkceChallenge,
  type OAuthStateData,
  type PkceChallenge,
  type CodeChallengeMethod,
} from './oauth/state.js';

// Rate limiting
export {
  checkRateLimit,
  assertRateLimit,
  resetRateLimit,
  type RateLimitConfig,
  type RateLimitResult,
} from './ratelimit/index.js';

// Session validation
export {
  validateSession,
  invalidateSessionCache,
} from './session/validate.js';

// Fastify middleware plugin
export {
  authMiddleware,
  type AuthPluginOptions,
} from './middleware/fastify.js';
