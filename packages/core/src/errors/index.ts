/**
 * Arcane canonical error types.
 * All errors are typed — never throw raw strings or untyped Error.
 */

export type ErrorCode =
  // Authentication / Authorization
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'API_KEY_INVALID'
  | 'API_KEY_EXPIRED'
  | 'SESSION_EXPIRED'
  | 'SESSION_NOT_FOUND'
  // Resource
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ALREADY_EXISTS'
  // Validation
  | 'VALIDATION_ERROR'
  | 'INVALID_CURSOR'
  // Policy
  | 'POLICY_DENIED'
  | 'POLICY_REQUIRES_CONFIRMATION'
  // Execution
  | 'EXECUTION_FAILED'
  | 'EXECUTION_TIMEOUT'
  | 'EXECUTION_CANCELLED'
  | 'INVALID_STATE_TRANSITION'
  // Connector / Connection
  | 'CONNECTION_NOT_FOUND'
  | 'CONNECTION_EXPIRED'
  | 'CONNECTION_REAUTH_REQUIRED'
  | 'CREDENTIAL_RESOLUTION_FAILED'
  | 'CONNECTOR_NOT_FOUND'
  | 'TOOL_NOT_FOUND'
  // Rate limiting
  | 'RATE_LIMITED'
  // Secret management
  | 'SECRET_ENCRYPTION_FAILED'
  | 'SECRET_DECRYPTION_FAILED'
  // Infrastructure
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR';

export interface ArcaneErrorContext {
  readonly [key: string]: unknown;
}

/**
 * Base error class for all Arcane errors.
 * Always includes an error code and optional context for structured logging.
 */
export class ArcaneError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly context?: ArcaneErrorContext;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    context?: ArcaneErrorContext,
  ) {
    super(message);
    this.name = 'ArcaneError';
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ArcaneError);
    }
  }
}

export class NotFoundError extends ArcaneError {
  constructor(resource: string, id?: string, context?: ArcaneErrorContext) {
    super(
      'NOT_FOUND',
      id ? `${resource} '${id}' not found` : `${resource} not found`,
      404,
      context,
    );
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ArcaneError {
  constructor(message: string, context?: ArcaneErrorContext) {
    super('CONFLICT', message, 409, context);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends ArcaneError {
  constructor(message: string, context?: ArcaneErrorContext) {
    super('VALIDATION_ERROR', message, 400, context);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends ArcaneError {
  constructor(message: string = 'Unauthorized', context?: ArcaneErrorContext) {
    super('UNAUTHORIZED', message, 401, context);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ArcaneError {
  constructor(message: string = 'Forbidden', context?: ArcaneErrorContext) {
    super('FORBIDDEN', message, 403, context);
    this.name = 'ForbiddenError';
  }
}

export class PolicyDeniedError extends ArcaneError {
  constructor(toolSlug: string, reason?: string, context?: ArcaneErrorContext) {
    super(
      'POLICY_DENIED',
      reason ? `Policy denied tool '${toolSlug}': ${reason}` : `Policy denied tool '${toolSlug}'`,
      403,
      context,
    );
    this.name = 'PolicyDeniedError';
  }
}

export class PolicyRequiresConfirmationError extends ArcaneError {
  constructor(toolSlug: string, context?: ArcaneErrorContext) {
    super(
      'POLICY_REQUIRES_CONFIRMATION',
      `Tool '${toolSlug}' requires user confirmation before execution`,
      202,
      context,
    );
    this.name = 'PolicyRequiresConfirmationError';
  }
}

export class RateLimitError extends ArcaneError {
  public readonly retryAfterMs?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfterMs?: number) {
    super('RATE_LIMITED', message, 429);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class InvalidStateTransitionError extends ArcaneError {
  constructor(from: string, to: string) {
    super(
      'INVALID_STATE_TRANSITION',
      `Invalid state transition: ${from} → ${to}`,
      409,
    );
    this.name = 'InvalidStateTransitionError';
  }
}

export class CredentialResolutionError extends ArcaneError {
  constructor(connectionId: string, context?: ArcaneErrorContext) {
    super(
      'CREDENTIAL_RESOLUTION_FAILED',
      `Failed to resolve credentials for connection '${connectionId}'`,
      500,
      context,
    );
    this.name = 'CredentialResolutionError';
  }
}

export class DatabaseError extends ArcaneError {
  constructor(message: string, cause?: unknown) {
    super('DATABASE_ERROR', `Database error: ${message}`, 500);
    this.name = 'DatabaseError';
    this.cause = cause;
  }
}

export class InternalError extends ArcaneError {
  constructor(message: string, cause?: unknown) {
    super('INTERNAL_ERROR', message, 500);
    this.name = 'InternalError';
    this.cause = cause;
  }
}

/** Type guard for ArcaneError */
export function isArcaneError(err: unknown): err is ArcaneError {
  return err instanceof ArcaneError;
}
