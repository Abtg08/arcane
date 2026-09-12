/**
 * Executions resource — run tools, poll results.
 */

import type { HttpClient } from '../http.js';
import type {
  PageResult,
  Execution,
  ExecuteRequest,
  ExecuteResult,
  WaitForExecutionOptions,
} from '../types.js';
import { ArcaneTimeoutError } from '../errors.js';

const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'REJECTED', 'TIMED_OUT']);

export interface ListExecutionsOptions {
  cursor?: string;
  limit?: number;
}

export class ExecutionsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Execute a tool. Returns immediately with a pending execution ID.
   * Use `get()` to poll, or `waitFor()` for a blocking helper.
   */
  execute(req: ExecuteRequest): Promise<ExecuteResult> {
    return this.http.post('/execute', req);
  }

  /**
   * Get a single execution by ID.
   */
  get(executionId: string): Promise<Execution> {
    return this.http.get(`/executions/${executionId}`);
  }

  /**
   * List executions with optional pagination.
   */
  list(opts: ListExecutionsOptions = {}): Promise<PageResult<Execution>> {
    return this.http.get('/executions', {
      cursor: opts.cursor,
      limit: opts.limit,
    });
  }

  /**
   * Wait for an execution to reach a terminal state.
   *
   * Polls `GET /executions/:id` at `intervalMs` intervals until the execution
   * succeeds, fails, or the `timeoutMs` wall-clock budget is exhausted.
   *
   * @throws ArcaneTimeoutError if the budget is exceeded
   */
  async waitFor(
    executionId: string,
    opts: WaitForExecutionOptions = {},
  ): Promise<Execution> {
    const { timeoutMs = 120_000, intervalMs = 1_000 } = opts;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const execution = await this.get(executionId);
      if (TERMINAL_STATUSES.has(execution.status)) {
        return execution;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await sleep(Math.min(intervalMs, remaining));
    }

    throw new ArcaneTimeoutError(
      `Execution ${executionId} did not complete within ${timeoutMs}ms`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
