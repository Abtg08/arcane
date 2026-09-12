/**
 * Gmail connector — tool definitions.
 * SI-05: Tool descriptions are untrusted data — never eval'd or used for routing.
 */

import type { ToolDef } from '@arcane/connector-sdk';

export const GMAIL_TOOLS: ToolDef[] = [
  // ── Messages ──────────────────────────────────────────────────────────────

  {
    slug: 'list_messages',
    name: 'List Messages',
    description: "List email messages in the user's mailbox.",
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/gmail/v1/users/me/messages' },
    parameters: [
      { name: 'q', in: 'query', required: false, type: 'string', description: 'Gmail search query' },
      { name: 'maxResults', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 500, default: 100 },
      { name: 'labelIds', in: 'query', required: false, type: 'string', description: 'Label ID to filter by' },
    ],
  },

  {
    slug: 'get_message',
    name: 'Get Message',
    description: 'Get a specific email message by ID.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/gmail/v1/users/me/messages/{id}' },
    parameters: [
      { name: 'id', in: 'path', required: true, type: 'string' },
      { name: 'format', in: 'query', required: false, type: 'string', enum: ['full', 'metadata', 'raw', 'minimal'], default: 'full' },
    ],
  },

  {
    slug: 'send_message',
    name: 'Send Message',
    description: 'Send an email message.',
    risk_level: ['WRITE', 'EXTERNAL_COMMUNICATION'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/gmail/v1/users/me/messages/send',
      body_schema: {
        type: 'object',
        required: ['raw'],
        properties: {
          raw: { type: 'string', description: 'Base64url-encoded RFC 2822 message' },
        },
      },
    },
    parameters: [
      { name: 'raw', in: 'body', required: true, type: 'string', description: 'Base64url-encoded RFC 2822 message' },
    ],
  },

  // ── Threads ───────────────────────────────────────────────────────────────

  {
    slug: 'list_threads',
    name: 'List Threads',
    description: "List email threads in the user's mailbox.",
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/gmail/v1/users/me/threads' },
    parameters: [
      { name: 'q', in: 'query', required: false, type: 'string' },
      { name: 'maxResults', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 500, default: 100 },
    ],
  },

  {
    slug: 'get_thread',
    name: 'Get Thread',
    description: 'Get a specific email thread.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/gmail/v1/users/me/threads/{id}' },
    parameters: [
      { name: 'id', in: 'path', required: true, type: 'string' },
    ],
  },

  // ── Labels ────────────────────────────────────────────────────────────────

  {
    slug: 'list_labels',
    name: 'List Labels',
    description: 'List all Gmail labels.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/gmail/v1/users/me/labels' },
    parameters: [],
  },

  {
    slug: 'modify_message',
    name: 'Modify Message',
    description: 'Add or remove labels from a message.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: true,
    http: {
      method: 'POST',
      path: '/gmail/v1/users/me/messages/{id}/modify',
      body_schema: {
        type: 'object',
        properties: {
          addLabelIds: { type: 'array', items: { type: 'string' } },
          removeLabelIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    parameters: [
      { name: 'id', in: 'path', required: true, type: 'string' },
      { name: 'addLabelIds', in: 'body', required: false, type: 'array', items: { type: 'string' } },
      { name: 'removeLabelIds', in: 'body', required: false, type: 'array', items: { type: 'string' } },
    ],
  },
];

const TOOL_MAP = new Map(GMAIL_TOOLS.map((t) => [t.slug, t]));

export function getGmailTool(slug: string): ToolDef | undefined {
  return TOOL_MAP.get(slug);
}
