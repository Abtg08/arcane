/**
 * Tools resource — list toolkits, inspect tools.
 */

import type { HttpClient } from '../http.js';
import type { PageResult, Toolkit, Tool } from '../types.js';

export interface ListToolkitsOptions {
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface ListToolsOptions {
  cursor?: string;
  limit?: number;
}

export class ToolsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List available toolkits, optionally filtered by a full-text search query.
   */
  listToolkits(opts: ListToolkitsOptions = {}): Promise<PageResult<Toolkit>> {
    return this.http.get('/toolkits', {
      q: opts.q,
      cursor: opts.cursor,
      limit: opts.limit,
    });
  }

  /**
   * List tools for a specific toolkit.
   */
  listTools(toolkitSlug: string, opts: ListToolsOptions = {}): Promise<PageResult<Tool>> {
    return this.http.get(`/toolkits/${toolkitSlug}/tools`, {
      cursor: opts.cursor,
      limit: opts.limit,
    });
  }

  /**
   * Get a specific tool by toolkit slug and tool slug.
   */
  getTool(toolkitSlug: string, toolSlug: string): Promise<Tool> {
    return this.http.get(`/toolkits/${toolkitSlug}/tools/${toolSlug}`);
  }
}
