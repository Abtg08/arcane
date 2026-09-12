/**
 * Arcane SDK error classes.
 *
 * ArcaneError        — base class for all SDK errors
 * ArcaneApiError     — HTTP-level error with status code and request ID
 * ArcaneAuthError    — 401/403 authentication/authorization failure
 * ArcaneTimeoutError — poll / network timeout
 */

export class ArcaneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArcaneError';
  }
}

export class ArcaneApiError extends ArcaneError {
  readonly status: number;
  readonly requestId: string | null;
  readonly code: string | null;

  constructor(status: number, message: string, requestId: string | null = null, code: string | null = null) {
    super(message);
    this.name = 'ArcaneApiError';
    this.status = status;
    this.requestId = requestId;
    this.code = code;
  }
}

export class ArcaneAuthError extends ArcaneApiError {
  constructor(message = 'Authentication failed', requestId: string | null = null) {
    super(401, message, requestId, 'UNAUTHORIZED');
    this.name = 'ArcaneAuthError';
  }
}

export class ArcaneTimeoutError extends ArcaneError {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'ArcaneTimeoutError';
  }
}
