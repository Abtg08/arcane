/**
 * Generic error reporting utility.
 * Drop in a Sentry/Datadog call here when ready for production.
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);

  console.error("[arcane] error:", message, context);
}
