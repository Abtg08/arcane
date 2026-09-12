/**
 * Stripe connector — tool definitions.
 *
 * Uses Stripe REST API v1: https://api.stripe.com/v1
 * Auth: Bearer token (secret key) via Authorization header.
 *
 * Stripe uses form-encoded POST bodies (application/x-www-form-urlencoded).
 *
 * SI-05: Tool descriptions are untrusted data — never eval'd or used for routing.
 */

import type { ToolDef } from '@arcane/connector-sdk';

export const STRIPE_TOOLS: ToolDef[] = [
  // ── Customers ─────────────────────────────────────────────────────────────

  {
    slug: 'list_customers',
    name: 'List Customers',
    description: 'List customers in the Stripe account.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/customers' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 100, default: 10 },
      { name: 'starting_after', in: 'query', required: false, type: 'string', description: 'Pagination cursor (customer ID)' },
      { name: 'email', in: 'query', required: false, type: 'string', description: 'Filter by email address' },
    ],
  },

  {
    slug: 'get_customer',
    name: 'Get Customer',
    description: 'Get a specific Stripe customer by ID.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/customers/{customer_id}' },
    parameters: [
      { name: 'customer_id', in: 'path', required: true, type: 'string' },
    ],
  },

  {
    slug: 'create_customer',
    name: 'Create Customer',
    description: 'Create a new Stripe customer.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: { method: 'POST', path: '/customers' },
    parameters: [
      { name: 'email', in: 'body', required: false, type: 'string' },
      { name: 'name', in: 'body', required: false, type: 'string' },
      { name: 'phone', in: 'body', required: false, type: 'string' },
      { name: 'description', in: 'body', required: false, type: 'string' },
      { name: 'metadata', in: 'body', required: false, type: 'object', description: 'Key-value metadata' },
    ],
  },

  {
    slug: 'update_customer',
    name: 'Update Customer',
    description: 'Update an existing Stripe customer.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: true,
    http: { method: 'POST', path: '/customers/{customer_id}' },
    parameters: [
      { name: 'customer_id', in: 'path', required: true, type: 'string' },
      { name: 'email', in: 'body', required: false, type: 'string' },
      { name: 'name', in: 'body', required: false, type: 'string' },
      { name: 'phone', in: 'body', required: false, type: 'string' },
      { name: 'description', in: 'body', required: false, type: 'string' },
      { name: 'metadata', in: 'body', required: false, type: 'object' },
    ],
  },

  // ── Payment Intents ────────────────────────────────────────────────────────

  {
    slug: 'list_payment_intents',
    name: 'List Payment Intents',
    description: 'List payment intents in the Stripe account.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/payment_intents' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 100, default: 10 },
      { name: 'starting_after', in: 'query', required: false, type: 'string', description: 'Pagination cursor' },
      { name: 'customer', in: 'query', required: false, type: 'string', description: 'Filter by customer ID' },
    ],
  },

  {
    slug: 'get_payment_intent',
    name: 'Get Payment Intent',
    description: 'Get a specific payment intent by ID.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/payment_intents/{payment_intent_id}' },
    parameters: [
      { name: 'payment_intent_id', in: 'path', required: true, type: 'string' },
    ],
  },

  {
    slug: 'create_payment_intent',
    name: 'Create Payment Intent',
    description: 'Create a new payment intent.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: { method: 'POST', path: '/payment_intents' },
    parameters: [
      { name: 'amount', in: 'body', required: true, type: 'integer', description: 'Amount in smallest currency unit (e.g. cents)' },
      { name: 'currency', in: 'body', required: true, type: 'string', description: 'Three-letter ISO currency code (e.g. usd)' },
      { name: 'customer', in: 'body', required: false, type: 'string', description: 'Customer ID' },
      { name: 'description', in: 'body', required: false, type: 'string' },
      { name: 'metadata', in: 'body', required: false, type: 'object' },
      { name: 'payment_method_types', in: 'body', required: false, type: 'array', description: 'Allowed payment method types' },
    ],
  },

  // ── Subscriptions ─────────────────────────────────────────────────────────

  {
    slug: 'list_subscriptions',
    name: 'List Subscriptions',
    description: 'List subscriptions in the Stripe account.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/subscriptions' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 100, default: 10 },
      { name: 'starting_after', in: 'query', required: false, type: 'string', description: 'Pagination cursor' },
      { name: 'customer', in: 'query', required: false, type: 'string', description: 'Filter by customer ID' },
      { name: 'status', in: 'query', required: false, type: 'string', enum: ['active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'trialing', 'unpaid', 'all'] },
    ],
  },

  {
    slug: 'get_subscription',
    name: 'Get Subscription',
    description: 'Get a specific subscription by ID.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/subscriptions/{subscription_id}' },
    parameters: [
      { name: 'subscription_id', in: 'path', required: true, type: 'string' },
    ],
  },

  {
    slug: 'cancel_subscription',
    name: 'Cancel Subscription',
    description: 'Cancel a subscription.',
    risk_level: ['WRITE', 'DESTRUCTIVE'],
    read_only: false,
    destructive: true,
    idempotent: true,
    http: { method: 'DELETE', path: '/subscriptions/{subscription_id}' },
    parameters: [
      { name: 'subscription_id', in: 'path', required: true, type: 'string' },
    ],
  },

  // ── Charges ───────────────────────────────────────────────────────────────

  {
    slug: 'list_charges',
    name: 'List Charges',
    description: 'List charges in the Stripe account.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/charges' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 100, default: 10 },
      { name: 'starting_after', in: 'query', required: false, type: 'string', description: 'Pagination cursor' },
      { name: 'customer', in: 'query', required: false, type: 'string', description: 'Filter by customer ID' },
    ],
  },

  {
    slug: 'get_charge',
    name: 'Get Charge',
    description: 'Get a specific charge by ID.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/charges/{charge_id}' },
    parameters: [
      { name: 'charge_id', in: 'path', required: true, type: 'string' },
    ],
  },
];

const TOOL_MAP = new Map(STRIPE_TOOLS.map((t) => [t.slug, t]));

export function getStripeTool(slug: string): ToolDef | undefined {
  return TOOL_MAP.get(slug);
}
