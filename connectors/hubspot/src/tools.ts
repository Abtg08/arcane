/**
 * HubSpot connector — tool definitions.
 * SI-05: Tool descriptions are untrusted data — never eval'd or used for routing.
 */

import type { ToolDef } from '@arcane/connector-sdk';

export const HUBSPOT_TOOLS: ToolDef[] = [
  // ── Contacts ──────────────────────────────────────────────────────────────

  {
    slug: 'list_contacts',
    name: 'List Contacts',
    description: 'List contacts in HubSpot CRM.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/crm/v3/objects/contacts' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 100, default: 10 },
      { name: 'properties', in: 'query', required: false, type: 'string', description: 'Comma-separated property names' },
      { name: 'after', in: 'query', required: false, type: 'string', description: 'Pagination cursor' },
    ],
  },

  {
    slug: 'get_contact',
    name: 'Get Contact',
    description: 'Get a specific HubSpot contact by ID.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/crm/v3/objects/contacts/{contactId}' },
    parameters: [
      { name: 'contactId', in: 'path', required: true, type: 'string' },
      { name: 'properties', in: 'query', required: false, type: 'string' },
    ],
  },

  {
    slug: 'create_contact',
    name: 'Create Contact',
    description: 'Create a new contact in HubSpot.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/crm/v3/objects/contacts',
      body_schema: {
        type: 'object',
        required: ['properties'],
        properties: {
          properties: {
            type: 'object',
            description: 'Contact properties (email, firstname, lastname, phone, etc.)',
          },
        },
      },
    },
    parameters: [
      { name: 'properties', in: 'body', required: true, type: 'object' },
    ],
  },

  {
    slug: 'update_contact',
    name: 'Update Contact',
    description: 'Update an existing HubSpot contact.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: true,
    http: {
      method: 'PATCH',
      path: '/crm/v3/objects/contacts/{contactId}',
      body_schema: {
        type: 'object',
        required: ['properties'],
        properties: {
          properties: { type: 'object' },
        },
      },
    },
    parameters: [
      { name: 'contactId', in: 'path', required: true, type: 'string' },
      { name: 'properties', in: 'body', required: true, type: 'object' },
    ],
  },

  // ── Deals ─────────────────────────────────────────────────────────────────

  {
    slug: 'list_deals',
    name: 'List Deals',
    description: 'List deals in HubSpot CRM.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/crm/v3/objects/deals' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 100, default: 10 },
      { name: 'properties', in: 'query', required: false, type: 'string' },
      { name: 'after', in: 'query', required: false, type: 'string' },
    ],
  },

  {
    slug: 'create_deal',
    name: 'Create Deal',
    description: 'Create a new deal in HubSpot.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/crm/v3/objects/deals',
      body_schema: {
        type: 'object',
        required: ['properties'],
        properties: {
          properties: {
            type: 'object',
            description: 'Deal properties (dealname, amount, pipeline, dealstage, etc.)',
          },
        },
      },
    },
    parameters: [
      { name: 'properties', in: 'body', required: true, type: 'object' },
    ],
  },

  // ── Companies ─────────────────────────────────────────────────────────────

  {
    slug: 'list_companies',
    name: 'List Companies',
    description: 'List companies in HubSpot CRM.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/crm/v3/objects/companies' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 100, default: 10 },
      { name: 'properties', in: 'query', required: false, type: 'string' },
      { name: 'after', in: 'query', required: false, type: 'string' },
    ],
  },

  {
    slug: 'search_contacts',
    name: 'Search Contacts',
    description: 'Search contacts using HubSpot filter criteria.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'POST',
      path: '/crm/v3/objects/contacts/search',
      body_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Full-text search query' },
          filterGroups: { type: 'array', description: 'Filter groups' },
          properties: { type: 'array', items: { type: 'string' } },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          after: { type: 'string' },
        },
      },
    },
    parameters: [
      { name: 'query', in: 'body', required: false, type: 'string' },
      { name: 'filterGroups', in: 'body', required: false, type: 'array', items: { type: 'object' } },
      { name: 'properties', in: 'body', required: false, type: 'array', items: { type: 'string' } },
      { name: 'limit', in: 'body', required: false, type: 'integer', minimum: 1, maximum: 100, default: 10 },
    ],
  },
];

const TOOL_MAP = new Map(HUBSPOT_TOOLS.map((t) => [t.slug, t]));

export function getHubSpotTool(slug: string): ToolDef | undefined {
  return TOOL_MAP.get(slug);
}
