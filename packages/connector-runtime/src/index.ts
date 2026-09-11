/**
 * @arcane/connector-runtime
 *
 * The ONLY component that resolves credentials and executes HTTP calls.
 * Credential resolution (SI-02): unseal() is called ONLY by CredentialResolver.
 * SSRF protection (SI-08): every HTTP call passes through assertSsrfSafe().
 * Response sanitization (SI-07): every provider response passes through sanitizeResponse().
 */

export { ConnectorRuntimeWorker } from './worker.js';
export { CredentialResolver } from './credential-resolver.js';
export type { ResolvedCredential, OAuth2Credential, ApiKeyCredential, BasicCredential, CustomCredential } from './credential-resolver.js';
export { HttpExecutor } from './http-executor.js';
export type { ExecutionDefinition, HttpExecutorResult, HttpExecutorOptions } from './http-executor.js';
export { sanitizeResponse, stripCredentialKeys } from './response-sanitizer.js';
export type { SanitizedOutput } from './response-sanitizer.js';
export { assertSsrfSafe, buildSsrfGuard, SsrfError, _dns } from './ssrf.js';
export type { SsrfGuardOptions, LookupFn } from './ssrf.js';
