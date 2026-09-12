/**
 * Thin HTTP transport layer for the Arcane SDK.
 *
 * - Attaches Authorization header
 * - Handles non-2xx responses → ArcaneApiError / ArcaneAuthError
 * - Never throws on network errors — callers get ArcaneError
 */

import { ArcaneApiError, ArcaneAuthError, ArcaneError } from './errors.js';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultTimeoutMs: number;

  constructor(baseUrl: string, apiKey: string, defaultTimeoutMs = 30_000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, query, timeoutMs = this.defaultTimeoutMs } = opts;

    let url = `${this.baseUrl}${path}`;
    if (query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) params.set(k, String(v));
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': '@arcane/sdk/0.1.0',
    };

    const fetchInit: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    };
    if (body !== undefined) {
      fetchInit.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      response = await fetch(url, fetchInit);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ArcaneError(`Network error: ${msg}`);
    }

    const requestId = response.headers.get('x-request-id');

    if (!response.ok) {
      let message = response.statusText;
      let code: string | null = null;
      try {
        const json = await response.json() as { message?: string; error?: string; code?: string };
        message = json.message ?? json.error ?? message;
        code = json.code ?? null;
      } catch {
        // ignore parse failure — use statusText
      }

      if (response.status === 401 || response.status === 403) {
        throw new ArcaneAuthError(message, requestId);
      }

      throw new ArcaneApiError(response.status, message, requestId, code);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return query !== undefined
      ? this.request<T>(path, { method: 'GET', query })
      : this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return body !== undefined
      ? this.request<T>(path, { method: 'POST', body })
      : this.request<T>(path, { method: 'POST' });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body });
  }

  del<T = void>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }
}
