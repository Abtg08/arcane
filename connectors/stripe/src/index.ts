/**
 * Stripe connector — public surface.
 *
 * Stripe uses API key authentication (Bearer token via Authorization header).
 * No OAuth2 flow needed — user provides their Stripe secret key directly.
 */

import type { ConnectorDef } from '@arcane/connector-sdk';
import { STRIPE_TOOLS } from './tools.js';

export const STRIPE_CONNECTOR_DEF: ConnectorDef = {
  id: 'stripe',
  slug: 'stripe',
  name: 'Stripe',
  description: 'Manage customers, payments, subscriptions, and payment intents in Stripe.',
  version: '1.0.0',
  category: 'payments',
  base_url: 'https://api.stripe.com/v1',
  default_headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  auth: {
    type: 'api_key',
    api_key: {
      header: 'Authorization',
      scheme: 'Bearer',
      env_var: 'STRIPE_SECRET_KEY',
    },
    connect_hint: 'Enter your Stripe secret key (sk_live_... or sk_test_...) to connect your Stripe account.',
  },
  tools: STRIPE_TOOLS,
};

export { STRIPE_TOOLS, getStripeTool } from './tools.js';
export type { ConnectorDef } from '@arcane/connector-sdk';
