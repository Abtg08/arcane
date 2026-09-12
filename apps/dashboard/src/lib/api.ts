/**
 * Typed API client for the Arcane API.
 *
 * All requests go through this client — never fetch() directly in components.
 * Errors are thrown as ApiError instances so React Query can handle them uniformly.
 */

import type {
  Execution,
  PageResult,
  Toolkit,
  Tool,
  Connection,
  Trigger,
  AuditEvent,
} from '@/types/api';

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

function getApiKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('arcane_api_key');
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const apiKey = getApiKey();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
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

// ─── Executions ────────────────────────────────────────────────────────────────

export const executionsApi = {
  list: (params?: { limit?: number; cursor?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.cursor) qs.set('cursor', params.cursor);
    if (params?.status) qs.set('status', params.status);
    const query = qs.toString();
    return request<PageResult<Execution>>(`/executions${query ? `?${query}` : ''}`);
  },

  get: (id: string) =>
    request<Execution>(`/executions/${id}`),

  getAuditEvents: (executionId: string) =>
    request<{ data: AuditEvent[] }>(`/executions/${executionId}/audit`),
};

// ─── Toolkits ──────────────────────────────────────────────────────────────────

export const toolkitsApi = {
  list: (params?: { q?: string; limit?: number; cursor?: string }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.cursor) qs.set('cursor', params.cursor);
    const query = qs.toString();
    return request<PageResult<Toolkit>>(`/toolkits${query ? `?${query}` : ''}`);
  },

  getTools: (slug: string, params?: { limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return request<PageResult<Tool>>(`/toolkits/${slug}/tools${query ? `?${query}` : ''}`);
  },

  getTool: (toolkit: string, tool: string) =>
    request<Tool>(`/toolkits/${toolkit}/tools/${tool}`),
};

// ─── Connections ───────────────────────────────────────────────────────────────

export const connectionsApi = {
  list: (params?: { limit?: number; cursor?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.cursor) qs.set('cursor', params.cursor);
    const query = qs.toString();
    return request<PageResult<Connection>>(`/connections${query ? `?${query}` : ''}`);
  },
};

// ─── Triggers ──────────────────────────────────────────────────────────────────

export const triggersApi = {
  list: (params?: { limit?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.status) qs.set('status', params.status);
    const query = qs.toString();
    return request<PageResult<Trigger>>(`/triggers${query ? `?${query}` : ''}`);
  },
};
