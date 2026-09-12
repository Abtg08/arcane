/**
 * Notion connector — tool definitions.
 * SI-05: Tool descriptions are untrusted data — never eval'd or used for routing.
 */

import type { ToolDef } from '@arcane/connector-sdk';

export const NOTION_TOOLS: ToolDef[] = [
  // ── Search ────────────────────────────────────────────────────────────────

  {
    slug: 'search',
    name: 'Search',
    description: 'Search Notion pages and databases by title.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'POST',
      path: '/search',
      body_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          filter: {
            type: 'object',
            properties: {
              value: { type: 'string', enum: ['page', 'database'] },
              property: { type: 'string', enum: ['object'] },
            },
          },
          page_size: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
        },
      },
    },
    parameters: [
      { name: 'query', in: 'body', required: false, type: 'string' },
      { name: 'filter', in: 'body', required: false, type: 'object' },
      { name: 'page_size', in: 'body', required: false, type: 'integer', minimum: 1, maximum: 100, default: 100 },
    ],
  },

  // ── Pages ─────────────────────────────────────────────────────────────────

  {
    slug: 'get_page',
    name: 'Get Page',
    description: 'Get a Notion page by ID.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/pages/{page_id}' },
    parameters: [
      { name: 'page_id', in: 'path', required: true, type: 'string' },
    ],
  },

  {
    slug: 'create_page',
    name: 'Create Page',
    description: 'Create a new Notion page in a database or as a child of another page.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/pages',
      body_schema: {
        type: 'object',
        required: ['parent', 'properties'],
        properties: {
          parent: {
            type: 'object',
            description: 'Parent object (database_id or page_id)',
          },
          properties: {
            type: 'object',
            description: 'Page properties',
          },
          children: {
            type: 'array',
            description: 'Page content blocks',
          },
        },
      },
    },
    parameters: [
      { name: 'parent', in: 'body', required: true, type: 'object' },
      { name: 'properties', in: 'body', required: true, type: 'object' },
      { name: 'children', in: 'body', required: false, type: 'array', items: { type: 'object' } },
    ],
  },

  {
    slug: 'update_page',
    name: 'Update Page',
    description: 'Update page properties or archive a page.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: true,
    http: {
      method: 'PATCH',
      path: '/pages/{page_id}',
      body_schema: {
        type: 'object',
        properties: {
          properties: { type: 'object' },
          archived: { type: 'boolean' },
        },
      },
    },
    parameters: [
      { name: 'page_id', in: 'path', required: true, type: 'string' },
      { name: 'properties', in: 'body', required: false, type: 'object' },
      { name: 'archived', in: 'body', required: false, type: 'boolean' },
    ],
  },

  // ── Databases ─────────────────────────────────────────────────────────────

  {
    slug: 'get_database',
    name: 'Get Database',
    description: 'Get a Notion database schema.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/databases/{database_id}' },
    parameters: [
      { name: 'database_id', in: 'path', required: true, type: 'string' },
    ],
  },

  {
    slug: 'query_database',
    name: 'Query Database',
    description: 'Query a Notion database with filters and sorts.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'POST',
      path: '/databases/{database_id}/query',
      body_schema: {
        type: 'object',
        properties: {
          filter: { type: 'object', description: 'Notion filter object' },
          sorts: { type: 'array', description: 'Sort criteria' },
          page_size: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
          start_cursor: { type: 'string', description: 'Pagination cursor' },
        },
      },
    },
    parameters: [
      { name: 'database_id', in: 'path', required: true, type: 'string' },
      { name: 'filter', in: 'body', required: false, type: 'object' },
      { name: 'sorts', in: 'body', required: false, type: 'array', items: { type: 'object' } },
      { name: 'page_size', in: 'body', required: false, type: 'integer', minimum: 1, maximum: 100, default: 100 },
      { name: 'start_cursor', in: 'body', required: false, type: 'string' },
    ],
  },

  // ── Blocks ────────────────────────────────────────────────────────────────

  {
    slug: 'get_block_children',
    name: 'Get Block Children',
    description: 'Get the children blocks of a page or block.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/blocks/{block_id}/children' },
    parameters: [
      { name: 'block_id', in: 'path', required: true, type: 'string' },
      { name: 'page_size', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 100, default: 100 },
    ],
  },

  {
    slug: 'append_block_children',
    name: 'Append Block Children',
    description: 'Append content blocks to a page or block.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'PATCH',
      path: '/blocks/{block_id}/children',
      body_schema: {
        type: 'object',
        required: ['children'],
        properties: {
          children: { type: 'array', description: 'Block objects to append' },
        },
      },
    },
    parameters: [
      { name: 'block_id', in: 'path', required: true, type: 'string' },
      { name: 'children', in: 'body', required: true, type: 'array', items: { type: 'object' } },
    ],
  },
];

const TOOL_MAP = new Map(NOTION_TOOLS.map((t) => [t.slug, t]));

export function getNotionTool(slug: string): ToolDef | undefined {
  return TOOL_MAP.get(slug);
}
