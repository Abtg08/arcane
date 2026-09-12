/**
 * ArcaneClient — main entry point for the TypeScript SDK.
 *
 * Usage:
 *   import { ArcaneClient } from '@arcane/sdk';
 *
 *   const arcane = new ArcaneClient({ apiKey: 'arc_live_...' });
 *
 *   const result = await arcane.executions.execute({
 *     tool: 'github.list_repos',
 *     connection_id: 'conn_...',
 *     input: { owner: 'acme' },
 *   });
 *
 *   const done = await arcane.executions.waitFor(result.execution_id);
 *   console.log(done.output);
 */

import { HttpClient } from './http.js';
import { ToolsResource } from './resources/tools.js';
import { ConnectionsResource } from './resources/connections.js';
import { ExecutionsResource } from './resources/executions.js';
import { TriggersResource } from './resources/triggers.js';
import type { ArcaneClientOptions } from './types.js';

export const DEFAULT_BASE_URL = 'https://api.arcane.run/v1';

export class ArcaneClient {
  /** Tools and toolkits discovery */
  readonly tools: ToolsResource;
  /** Connected accounts management */
  readonly connections: ConnectionsResource;
  /** Tool execution and result polling */
  readonly executions: ExecutionsResource;
  /** Event triggers and webhook delivery */
  readonly triggers: TriggersResource;

  private readonly http: HttpClient;

  constructor(opts: ArcaneClientOptions) {
    if (!opts.apiKey) {
      throw new Error('ArcaneClient: apiKey is required');
    }

    const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;

    this.http = new HttpClient(baseUrl, opts.apiKey, opts.timeoutMs);

    this.tools = new ToolsResource(this.http);
    this.connections = new ConnectionsResource(this.http);
    this.executions = new ExecutionsResource(this.http);
    this.triggers = new TriggersResource(this.http);
  }
}
