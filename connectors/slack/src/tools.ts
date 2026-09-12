/**
 * Slack connector — tool definitions.
 * SI-05: Tool descriptions are untrusted data — never eval'd or used for routing.
 */

import type { ToolDef } from '@arcane/connector-sdk';

export const SLACK_TOOLS: ToolDef[] = [
  // ── Channels ──────────────────────────────────────────────────────────────

  {
    slug: 'list_channels',
    name: 'List Channels',
    description: 'List public channels in the workspace.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/conversations.list' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 1000, default: 100 },
      { name: 'types', in: 'query', required: false, type: 'string', default: 'public_channel' },
    ],
  },

  {
    slug: 'get_channel',
    name: 'Get Channel',
    description: 'Get information about a Slack channel.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/conversations.info' },
    parameters: [
      { name: 'channel', in: 'query', required: true, type: 'string', description: 'Channel ID' },
    ],
  },

  {
    slug: 'list_channel_messages',
    name: 'List Channel Messages',
    description: 'Retrieve messages from a channel.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/conversations.history' },
    parameters: [
      { name: 'channel', in: 'query', required: true, type: 'string', description: 'Channel ID' },
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 999, default: 100 },
    ],
  },

  // ── Messages ──────────────────────────────────────────────────────────────

  {
    slug: 'send_message',
    name: 'Send Message',
    description: 'Send a message to a Slack channel or user.',
    risk_level: ['WRITE', 'EXTERNAL_COMMUNICATION'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/chat.postMessage',
      body_schema: {
        type: 'object',
        required: ['channel', 'text'],
        properties: {
          channel: { type: 'string', description: 'Channel ID or user ID' },
          text: { type: 'string', description: 'Message text (plain or mrkdwn)' },
          thread_ts: { type: 'string', description: 'Thread timestamp to reply in thread' },
        },
      },
    },
    parameters: [
      { name: 'channel', in: 'body', required: true, type: 'string' },
      { name: 'text', in: 'body', required: true, type: 'string' },
      { name: 'thread_ts', in: 'body', required: false, type: 'string' },
    ],
  },

  {
    slug: 'update_message',
    name: 'Update Message',
    description: 'Update an existing Slack message.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: true,
    http: {
      method: 'POST',
      path: '/chat.update',
      body_schema: {
        type: 'object',
        required: ['channel', 'ts', 'text'],
        properties: {
          channel: { type: 'string' },
          ts: { type: 'string', description: 'Timestamp of the message to update' },
          text: { type: 'string' },
        },
      },
    },
    parameters: [
      { name: 'channel', in: 'body', required: true, type: 'string' },
      { name: 'ts', in: 'body', required: true, type: 'string' },
      { name: 'text', in: 'body', required: true, type: 'string' },
    ],
  },

  // ── Users ─────────────────────────────────────────────────────────────────

  {
    slug: 'list_users',
    name: 'List Users',
    description: 'List users in the Slack workspace.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/users.list' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 200, default: 200 },
    ],
  },

  {
    slug: 'get_user',
    name: 'Get User',
    description: 'Get information about a Slack user.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/users.info' },
    parameters: [
      { name: 'user', in: 'query', required: true, type: 'string', description: 'User ID' },
    ],
  },
];

const TOOL_MAP = new Map(SLACK_TOOLS.map((t) => [t.slug, t]));

export function getSlackTool(slug: string): ToolDef | undefined {
  return TOOL_MAP.get(slug);
}
