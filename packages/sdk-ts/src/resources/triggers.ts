/**
 * Triggers resource — manage event triggers, subscriptions, and webhook destinations.
 */

import type { HttpClient } from '../http.js';
import type {
  PageResult,
  Trigger,
  CreateTriggerRequest,
  Subscription,
  WebhookDestination,
  CreateDestinationRequest,
} from '../types.js';

export interface ListTriggersOptions {
  cursor?: string;
  limit?: number;
  status?: 'ACTIVE' | 'PAUSED' | 'DELETED';
}

export interface SubscribeOptions {
  destination_id: string;
  external_user_id: string;
}

export class TriggersResource {
  constructor(private readonly http: HttpClient) {}

  // ── Triggers ──────────────────────────────────────────────────────────────

  /**
   * Create a new trigger.
   */
  create(req: CreateTriggerRequest): Promise<Trigger> {
    return this.http.post('/triggers', req);
  }

  /**
   * List triggers with optional pagination and status filter.
   */
  list(opts: ListTriggersOptions = {}): Promise<PageResult<Trigger>> {
    return this.http.get('/triggers', {
      cursor: opts.cursor,
      limit: opts.limit,
      status: opts.status,
    });
  }

  /**
   * Get a trigger by ID.
   */
  get(triggerId: string): Promise<Trigger> {
    return this.http.get(`/triggers/${triggerId}`);
  }

  /**
   * Update a trigger's name, description, or status.
   */
  update(triggerId: string, patch: Partial<Pick<Trigger, 'name' | 'description' | 'status'>>): Promise<Trigger> {
    return this.http.patch(`/triggers/${triggerId}`, patch);
  }

  /**
   * Soft-delete a trigger (sets status to DELETED).
   */
  delete(triggerId: string): Promise<void> {
    return this.http.del(`/triggers/${triggerId}`);
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  /**
   * Subscribe a user to a trigger's events.
   * Upserts — safe to call multiple times for the same user/trigger pair.
   */
  subscribe(triggerId: string, opts: SubscribeOptions): Promise<Subscription> {
    return this.http.post(`/triggers/${triggerId}/subscriptions`, opts);
  }

  /**
   * List subscriptions for a trigger.
   */
  listSubscriptions(triggerId: string): Promise<PageResult<Subscription>> {
    return this.http.get(`/triggers/${triggerId}/subscriptions`);
  }

  /**
   * Unsubscribe a user from a trigger.
   */
  unsubscribe(triggerId: string, subscriptionId: string): Promise<void> {
    return this.http.del(`/triggers/${triggerId}/subscriptions/${subscriptionId}`);
  }

  // ── Webhook destinations ──────────────────────────────────────────────────

  /**
   * Create a webhook destination.
   */
  createDestination(req: CreateDestinationRequest): Promise<WebhookDestination> {
    return this.http.post('/webhook-destinations', req);
  }

  /**
   * List webhook destinations.
   */
  listDestinations(): Promise<PageResult<WebhookDestination>> {
    return this.http.get('/webhook-destinations');
  }

  /**
   * Delete a webhook destination.
   */
  deleteDestination(destinationId: string): Promise<void> {
    return this.http.del(`/webhook-destinations/${destinationId}`);
  }
}
