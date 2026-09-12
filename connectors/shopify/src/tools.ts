/**
 * Shopify connector — tool definitions.
 *
 * NOTE: Shopify base_url is shop-specific: https://{shop}.myshopify.com/admin/api/2024-01
 * The shop domain is resolved at runtime from the connection record.
 *
 * SI-05: Tool descriptions are untrusted data — never eval'd or used for routing.
 */

import type { ToolDef } from '@arcane/connector-sdk';

export const SHOPIFY_TOOLS: ToolDef[] = [
  // ── Products ──────────────────────────────────────────────────────────────

  {
    slug: 'list_products',
    name: 'List Products',
    description: "List products in the Shopify store.",
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/products.json' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 250, default: 50 },
      { name: 'status', in: 'query', required: false, type: 'string', enum: ['active', 'draft', 'archived'] },
      { name: 'page_info', in: 'query', required: false, type: 'string', description: 'Pagination cursor' },
    ],
  },

  {
    slug: 'get_product',
    name: 'Get Product',
    description: 'Get a specific Shopify product by ID.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/products/{product_id}.json' },
    parameters: [
      { name: 'product_id', in: 'path', required: true, type: 'integer' },
    ],
  },

  {
    slug: 'create_product',
    name: 'Create Product',
    description: 'Create a new product in the Shopify store.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/products.json',
      body_schema: {
        type: 'object',
        required: ['product'],
        properties: {
          product: {
            type: 'object',
            required: ['title'],
            properties: {
              title: { type: 'string' },
              body_html: { type: 'string' },
              vendor: { type: 'string' },
              product_type: { type: 'string' },
              status: { type: 'string', enum: ['active', 'draft', 'archived'] },
            },
          },
        },
      },
    },
    parameters: [
      { name: 'product', in: 'body', required: true, type: 'object' },
    ],
  },

  // ── Orders ────────────────────────────────────────────────────────────────

  {
    slug: 'list_orders',
    name: 'List Orders',
    description: 'List orders in the Shopify store.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/orders.json' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 250, default: 50 },
      { name: 'status', in: 'query', required: false, type: 'string', enum: ['open', 'closed', 'cancelled', 'any'], default: 'open' },
      { name: 'financial_status', in: 'query', required: false, type: 'string', description: 'Filter by financial status' },
    ],
  },

  {
    slug: 'get_order',
    name: 'Get Order',
    description: 'Get a specific Shopify order by ID.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/orders/{order_id}.json' },
    parameters: [
      { name: 'order_id', in: 'path', required: true, type: 'integer' },
    ],
  },

  // ── Customers ─────────────────────────────────────────────────────────────

  {
    slug: 'list_customers',
    name: 'List Customers',
    description: 'List customers in the Shopify store.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/customers.json' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 250, default: 50 },
    ],
  },

  {
    slug: 'search_customers',
    name: 'Search Customers',
    description: 'Search for customers by name, email, or other fields.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/customers/search.json' },
    parameters: [
      { name: 'query', in: 'query', required: true, type: 'string', description: 'Search query' },
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 250, default: 50 },
    ],
  },

  {
    slug: 'get_shop',
    name: 'Get Shop',
    description: 'Get information about the Shopify store.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/shop.json' },
    parameters: [],
  },
];

const TOOL_MAP = new Map(SHOPIFY_TOOLS.map((t) => [t.slug, t]));

export function getShopifyTool(slug: string): ToolDef | undefined {
  return TOOL_MAP.get(slug);
}
