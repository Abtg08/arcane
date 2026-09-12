/**
 * @arcane/sdk — Official TypeScript SDK for the Arcane platform.
 *
 * Developers integrate this SDK to let their AI agents discover and
 * execute tools on behalf of their users.
 *
 * @example
 * ```ts
 * import { ArcaneClient } from '@arcane/sdk';
 *
 * const arcane = new ArcaneClient({ apiKey: process.env.ARCANE_API_KEY! });
 *
 * // Execute a tool
 * const { execution_id } = await arcane.executions.execute({
 *   tool: 'github.list_repos',
 *   connection_id: 'conn_...',
 *   input: { owner: 'acme' },
 * });
 *
 * // Wait for result
 * const result = await arcane.executions.waitFor(execution_id);
 * console.log(result.output);
 * ```
 */

export { ArcaneClient, DEFAULT_BASE_URL } from './client.js';

// Error classes
export {
  ArcaneError,
  ArcaneApiError,
  ArcaneAuthError,
  ArcaneTimeoutError,
} from './errors.js';

// Types
export type {
  ArcaneClientOptions,
  WaitForExecutionOptions,
  PageResult,
  Toolkit,
  Tool,
  Connection,
  Execution,
  ExecutionStatus,
  ExecuteRequest,
  ExecuteResult,
  Trigger,
  TriggerStatus,
  CreateTriggerRequest,
  Subscription,
  WebhookDestination,
  CreateDestinationRequest,
} from './types.js';

// Resource option types
export type { ListToolkitsOptions, ListToolsOptions } from './resources/tools.js';
export type { ListConnectionsOptions, InitiateOAuthOptions, OAuthInitiateResult } from './resources/connections.js';
export type { ListExecutionsOptions } from './resources/executions.js';
export type { ListTriggersOptions, SubscribeOptions } from './resources/triggers.js';
