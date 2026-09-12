/**
 * Shopify connector — public surface.
 *
 * NOTE: base_url is a template; connector-runtime substitutes {shop} at runtime.
 */

import type { ConnectorDef } from '@arcane/connector-sdk';
import { SHOPIFY_TOOLS } from './tools.js';

export const SHOPIFY_CONNECTOR_DEF: ConnectorDef = {
  id: 'shopify',
  slug: 'shopify',
  name: 'Shopify',
  description: 'Manage products, orders, and customers in a Shopify store.',
  version: '1.0.0',
  category: 'ecommerce',
  base_url: 'https://{shop}.myshopify.com/admin/api/2024-01',
  default_headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    type: 'oauth2',
    oauth2: {
      authorization_url: 'https://{shop}.myshopify.com/admin/oauth/authorize',
      token_url: 'https://{shop}.myshopify.com/admin/oauth/access_token',
      scopes: ['read_products', 'write_products', 'read_orders', 'read_customers'],
      pkce: false,
      refresh_supported: false,
    },
    connect_hint: 'Connect your Shopify store to manage products, orders, and customers.',
  },
  tools: SHOPIFY_TOOLS,
};

export { SHOPIFY_TOOLS, getShopifyTool } from './tools.js';
export type { ConnectorDef } from '@arcane/connector-sdk';
