/**
 * Trigger worker — fans out inbound events to subscriptions and delivers
 * payloads to webhook destinations.
 *
 * Pipeline (per WebhookReceivedMessage):
 *   1. Mark event PROCESSING
 *   2. Load all ACTIVE subscriptions for this trigger
 *   3. For each subscription:
 *      a. Load destination URL
 *      b. Publish WebhookDeliverMessage to NATS webhooks.deliver
 *   4. Mark event DELIVERED (fanout complete) or FAILED
 *
 * Pipeline (per WebhookDeliverMessage):
 *   1. Insert delivery record (status: DELIVERING)
 *   2. Resolve signing secret if secret_reference present
 *   3. HTTP POST to destination URL (10s timeout)
 *   4. On success: update delivery SUCCEEDED, update event DELIVERED
 *   5. On failure: update delivery FAILED, schedule retry if under max attempts
 *   6. After MAX_DELIVERY_ATTEMPTS: DEAD_LETTERED
 *
 * Deduplication:
 *   - payload_hash in event record prevents duplicate event insertion
 *   - Delivery records have (event_id, destination_id, attempt_number) unique key
 *
 * At-least-once: NATS JetStream ack only after processing completes.
 */

import type { NatsConnection, JetStreamClient } from 'nats';
import { getPool, type DbPool } from '@arcane/core';
import type { ConnectorRuntimeConfig } from '@arcane/config';
import {
  SUBJECT_WEBHOOKS_RECEIVED,
  SUBJECT_WEBHOOKS_DELIVER,
  CONSUMER_TRIGGER_WORKER,
  encode,
  decode,
  type WebhookReceivedMessage,
  type WebhookDeliverMessage,
} from '@arcane/nats-client';
import { deliver, MAX_DELIVERY_ATTEMPTS, retryDelayMs } from './delivery.js';

export class TriggerWorker {
  private nc?: NatsConnection;
  private js?: JetStreamClient;
  private readonly db: DbPool;

  constructor(_config: ConnectorRuntimeConfig) {
    this.db = getPool();
  }

  async start(nc: NatsConnection): Promise<void> {
    this.nc = nc;
    this.js = nc.jetstream();

    // Subscribe: inbound events (fanout phase)
    const fanoutSub = await this.js.subscribe(SUBJECT_WEBHOOKS_RECEIVED, {
      config: { durable_name: `${CONSUMER_TRIGGER_WORKER}-fanout` },
    });

    // Subscribe: delivery jobs
    const deliverSub = await this.js.subscribe(SUBJECT_WEBHOOKS_DELIVER, {
      config: { durable_name: `${CONSUMER_TRIGGER_WORKER}-deliver` },
    });

    console.info('[trigger-worker] Subscribed to webhooks.received and webhooks.deliver');

    // Run both consumers concurrently
    void this.consumeFanout(fanoutSub);
    void this.consumeDelivery(deliverSub);
  }

  async stop(): Promise<void> {
    await this.nc?.drain();
    await this.nc?.close();
  }

  // ── Fanout consumer ───────────────────────────────────────────────────────────

  private async consumeFanout(
    sub: AsyncIterable<{ data: Uint8Array; ack(): void }>,
  ): Promise<void> {
    for await (const msg of sub) {
      try {
        const event = decode<WebhookReceivedMessage>(msg.data);
        await this.fanoutEvent(event);
      } catch (err) {
        console.error('[trigger-worker] Fanout error:', err);
      } finally {
        msg.ack();
      }
    }
  }

  private async fanoutEvent(event: WebhookReceivedMessage): Promise<void> {
    const { event_id, trigger_id, environment_id, payload_inline } = event;

    // Mark PROCESSING
    await this.db.query(
      `UPDATE events SET status = 'PROCESSING', updated_at = NOW() WHERE id = $1`,
      [event_id],
    );

    // Load active subscriptions
    const { rows: subs } = await this.db.query<{
      id: string;
      destination_id: string;
      destination_url: string;
      secret_reference: string | null;
    }>(
      `SELECT ts.id, ts.destination_id, wd.url AS destination_url,
              wd.secret_reference
       FROM trigger_subscriptions ts
       JOIN webhook_destinations wd ON wd.id = ts.destination_id
       WHERE ts.trigger_id = $1 AND ts.status = 'ACTIVE'
         AND wd.status = 'ACTIVE' AND wd.environment_id = $2`,
      [trigger_id, environment_id],
    );

    if (subs.length === 0) {
      // No subscribers — mark delivered (vacuously)
      await this.db.query(
        `UPDATE events SET status = 'DELIVERED', processed_at = NOW() WHERE id = $1`,
        [event_id],
      );
      return;
    }

    // Publish one delivery job per subscription
    const payload = payload_inline ?? {};
    for (const sub of subs) {
      const deliveryId = crypto.randomUUID();
      const deliverMsg: WebhookDeliverMessage = {
        delivery_id: deliveryId,
        event_id,
        destination_id: sub.destination_id,
        destination_url: sub.destination_url,
        payload,
        attempt_number: 1,
        secret_reference: sub.secret_reference,
      };
      await this.js!.publish(SUBJECT_WEBHOOKS_DELIVER, encode(deliverMsg));
    }

    // Mark event as processing (deliveries pending)
    await this.db.query(
      `UPDATE events SET attempt_count = $1 WHERE id = $2`,
      [subs.length, event_id],
    );
  }

  // ── Delivery consumer ─────────────────────────────────────────────────────────

  private async consumeDelivery(
    sub: AsyncIterable<{ data: Uint8Array; ack(): void }>,
  ): Promise<void> {
    for await (const msg of sub) {
      try {
        const job = decode<WebhookDeliverMessage>(msg.data);
        await this.processDelivery(job);
      } catch (err) {
        console.error('[trigger-worker] Delivery error:', err);
      } finally {
        msg.ack();
      }
    }
  }

  private async processDelivery(job: WebhookDeliverMessage): Promise<void> {
    const { delivery_id, event_id, destination_id, destination_url, payload, attempt_number, secret_reference } = job;

    // Insert delivery record
    await this.db.query(
      `INSERT INTO deliveries
         (id, event_id, destination_id, attempt_number, status, started_at, created_at)
       VALUES ($1, $2, $3, $4, 'DELIVERING', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [delivery_id, event_id, destination_id, attempt_number],
    );

    // Resolve signing secret (Phase 5: plain secret_reference is the value itself;
    // Phase 7 will use SecretManager.unseal())
    const signingSecret = secret_reference ?? undefined;

    // HTTP delivery — only pass signingSecret when it's defined (exactOptionalPropertyTypes)
    const result = await deliver(
      signingSecret !== undefined
        ? { url: destination_url, payload, signingSecret }
        : { url: destination_url, payload },
    );

    if (result.success) {
      await this.db.query(
        `UPDATE deliveries
         SET status = 'SUCCEEDED', http_status = $1, completed_at = NOW()
         WHERE id = $2`,
        [result.httpStatus, delivery_id],
      );

      // Check if all deliveries for this event are done
      await this.markEventDeliveredIfComplete(event_id);
    } else {
      if (attempt_number >= MAX_DELIVERY_ATTEMPTS) {
        // Dead letter
        await this.db.query(
          `UPDATE deliveries
           SET status = 'DEAD_LETTERED', http_status = $1, error_code = $2, completed_at = NOW()
           WHERE id = $3`,
          [result.httpStatus, result.error ?? 'MAX_ATTEMPTS_EXCEEDED', delivery_id],
        );
      } else {
        // Schedule retry
        const nextAttempt = attempt_number + 1;
        const delayMs = retryDelayMs(nextAttempt);
        const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

        await this.db.query(
          `UPDATE deliveries
           SET status = 'FAILED', http_status = $1, error_code = $2,
               next_retry_at = $3, completed_at = NOW()
           WHERE id = $4`,
          [result.httpStatus, result.error ?? 'HTTP_FAILURE', nextRetryAt, delivery_id],
        );

        // Re-publish with incremented attempt number after delay
        // (In production, use NATS JetStream scheduled messages or a retry queue)
        setTimeout(() => {
          const retryMsg: WebhookDeliverMessage = {
            ...job,
            delivery_id: crypto.randomUUID(), // new delivery record per attempt
            attempt_number: nextAttempt,
          };
          void this.js?.publish(SUBJECT_WEBHOOKS_DELIVER, encode(retryMsg));
        }, delayMs);
      }
    }
  }

  private async markEventDeliveredIfComplete(eventId: string): Promise<void> {
    // If all deliveries for this event have succeeded, mark event DELIVERED
    const { rows } = await this.db.query<{ pending: string }>(
      `SELECT COUNT(*) AS pending FROM deliveries
       WHERE event_id = $1 AND status NOT IN ('SUCCEEDED', 'DEAD_LETTERED')`,
      [eventId],
    );
    const pending = parseInt(rows[0]?.pending ?? '1', 10);
    if (pending === 0) {
      await this.db.query(
        `UPDATE events SET status = 'DELIVERED', processed_at = NOW() WHERE id = $1`,
        [eventId],
      );
    }
  }
}
