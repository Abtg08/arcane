/**
 * Typed API client for the Arcane API.
 *
 * All requests go through this client — never fetch() directly in components.
 * Errors are thrown as ApiError instances so React Query can handle them uniformly.
 */

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly requestId?: string;

  constructor(code: string, message: string, status: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!res.ok) {
    let code = 'INTERNAL_ERROR';
    let message = `Request failed with status ${res.status}`;
    let requestId: string | undefined;

    try {
      const body = await res.json() as {
        error?: { code?: string; message?: string; request_id?: string };
      };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
      requestId = body.error?.request_id;
    } catch {
      // Body wasn't JSON — use defaults
    }

    throw new ApiError(code, message, res.status, requestId);
  }

  return res.json() as Promise<T>;
}

// ─── API methods — typed wrappers ──────────────────────────────────────────────

export const api = {
  get: <T>(path: string, headers?: HeadersInit) =>
    request<T>(path, { method: 'GET', headers }),

  post: <T>(path: string, body: unknown, headers?: HeadersInit) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
    }),

  patch: <T>(path: string, body: unknown, headers?: HeadersInit) =>
    request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers,
    }),

  delete: <T>(path: string, headers?: HeadersInit) =>
    request<T>(path, { method: 'DELETE', headers }),
};
