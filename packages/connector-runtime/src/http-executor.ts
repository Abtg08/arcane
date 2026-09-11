/**
 * HTTP executor — makes the actual provider API call.
 *
 * Responsibilities:
 *   - Inject credentials into the request (never logged — SI-01)
 *   - Enforce SSRF guard before opening connection (SI-08)
 *   - Enforce timeout and max-response-size limits
 *   - Return raw provider response for sanitization upstream
 *
 * Does NOT:
 *   - Validate the response shape (that's response-sanitizer.ts — SI-07)
 *   - Store anything to the DB
 *   - Log credential values
 */

import { fetch, type RequestInit } from 'undici';
import { assertSsrfSafe, type SsrfGuardOptions } from './ssrf.js';
import type { ResolvedCredential } from './credential-resolver.js';
import { InternalError } from '@arcane/core';

export interface HttpExecutorOptions {
  ssrfGuard: SsrfGuardOptions;
  timeoutMs: number;
  maxResponseBytes: number;
}

export interface ExecutionDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string; // May contain {param} placeholders resolved from input
  headers?: Record<string, string>;
  body_template?: 'json' | 'form' | 'none';
  // Which input fields go into path params vs query vs body
  path_params?: string[];
  query_params?: string[];
  body_params?: string[];
}

export interface HttpExecutorResult {
  http_status: number;
  headers: Record<string, string>;
  body: unknown; // Raw parsed JSON or text — sanitized by caller
  latency_ms: number;
}

export class HttpExecutor {
  constructor(private readonly opts: HttpExecutorOptions) {}

  async execute(
    definition: ExecutionDefinition,
    input: Record<string, unknown>,
    credential: ResolvedCredential,
  ): Promise<HttpExecutorResult> {
    // Build URL (path param substitution)
    const url = this.buildUrl(definition, input);

    // SSRF check — must happen before connection (SI-08)
    await assertSsrfSafe(url, this.opts.ssrfGuard);

    // Build request headers
    const headers = this.buildHeaders(definition, credential);

    // Build request body
    const body = this.buildBody(definition, input);

    const init: RequestInit = {
      method: definition.method,
      headers,
      signal: AbortSignal.timeout(this.opts.timeoutMs),
    };
    if (body !== undefined) {
      init.body = body;
    }

    const startMs = Date.now();
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(url, init);
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') {
        throw new InternalError(`Provider request timed out after ${this.opts.timeoutMs}ms`, err);
      }
      throw new InternalError('Provider request failed', err);
    }

    const latency_ms = Date.now() - startMs;

    // Read body with size limit
    const rawBody = await this.readBody(response, url);

    // Parse JSON or return as text
    const parsedBody = this.parseBody(rawBody, response.headers.get('content-type') ?? '');

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      // Never forward sensitive headers downstream
      const lower = key.toLowerCase();
      if (!lower.startsWith('set-cookie') && lower !== 'authorization') {
        responseHeaders[key] = value;
      }
    });

    return {
      http_status: response.status,
      headers: responseHeaders,
      body: parsedBody,
      latency_ms,
    };
  }

  private buildUrl(def: ExecutionDefinition, input: Record<string, unknown>): string {
    let url = def.url;

    // Substitute {param} placeholders from path_params
    for (const param of def.path_params ?? []) {
      const value = input[param];
      if (value === undefined) {
        throw new InternalError(`Missing required path param: ${param}`);
      }
      url = url.replace(`{${param}}`, encodeURIComponent(String(value)));
    }

    // Append query params
    const queryParams = def.query_params ?? [];
    if (queryParams.length > 0) {
      const qs = new URLSearchParams();
      for (const param of queryParams) {
        const value = input[param];
        if (value !== undefined && value !== null) {
          qs.append(param, String(value));
        }
      }
      const qsStr = qs.toString();
      if (qsStr) url += (url.includes('?') ? '&' : '?') + qsStr;
    }

    return url;
  }

  private buildHeaders(
    def: ExecutionDefinition,
    credential: ResolvedCredential,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Arcane/1.0',
      ...(def.headers ?? {}),
    };

    // Inject credential — values never logged
    switch (credential.type) {
      case 'oauth2':
        headers['Authorization'] = `Bearer ${credential.access_token}`;
        break;
      case 'api_key': {
        const headerName = credential.header_name ?? 'Authorization';
        headers[headerName] = headerName === 'Authorization'
          ? `Bearer ${credential.api_key}`
          : credential.api_key;
        break;
      }
      case 'basic': {
        const encoded = Buffer.from(`${credential.username}:${credential.password}`).toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
        break;
      }
      case 'custom':
        // Custom headers injected as-is — connector manifest defines them
        Object.assign(headers, credential.fields);
        break;
    }

    return headers;
  }

  private buildBody(
    def: ExecutionDefinition,
    input: Record<string, unknown>,
  ): string | URLSearchParams | undefined {
    const bodyTemplate = def.body_template ?? 'none';
    const bodyParams = def.body_params ?? [];

    if (bodyTemplate === 'none' || bodyParams.length === 0) return undefined;

    const bodyData: Record<string, unknown> = {};
    for (const param of bodyParams) {
      if (param in input) bodyData[param] = input[param];
    }

    if (bodyTemplate === 'json') {
      return JSON.stringify(bodyData);
    }

    if (bodyTemplate === 'form') {
      const form = new URLSearchParams();
      for (const [k, v] of Object.entries(bodyData)) {
        form.append(k, String(v));
      }
      return form;
    }

    return undefined;
  }

  private async readBody(
    response: Awaited<ReturnType<typeof fetch>>,
    url: string,
  ): Promise<string> {
    // Stream with size limit — prevents unbounded memory usage
    const reader = response.body?.getReader();
    if (!reader) return '';

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > this.opts.maxResponseBytes) {
          reader.cancel();
          throw new InternalError(
            `Provider response too large (>${this.opts.maxResponseBytes} bytes) from ${url}`,
          );
        }
        chunks.push(value);
      }
    }

    return Buffer.concat(chunks).toString('utf-8');
  }

  private parseBody(raw: string, contentType: string): unknown {
    if (!raw) return null;
    if (contentType.includes('application/json')) {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return raw; // Return raw text if JSON parse fails
      }
    }
    return raw;
  }
}
