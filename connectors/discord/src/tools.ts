/**
 * Discord connector — tool definitions.
 * SI-05: Tool descriptions are untrusted data — never eval'd or used for routing.
 */

import type { ToolDef } from '@arcane/connector-sdk';

export const DISCORD_TOOLS: ToolDef[] = [
  // ── Guilds ────────────────────────────────────────────────────────────────

  {
    slug: 'list_guilds',
    name: 'List Guilds',
    description: 'List Discord guilds (servers) the bot is a member of.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/users/@me/guilds' },
    parameters: [
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 200, default: 100 },
    ],
  },

  {
    slug: 'get_guild',
    name: 'Get Guild',
    description: 'Get information about a specific Discord guild.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/guilds/{guild_id}' },
    parameters: [
      { name: 'guild_id', in: 'path', required: true, type: 'string' },
    ],
  },

  // ── Channels ──────────────────────────────────────────────────────────────

  {
    slug: 'list_channels',
    name: 'List Channels',
    description: 'List channels in a Discord guild.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/guilds/{guild_id}/channels' },
    parameters: [
      { name: 'guild_id', in: 'path', required: true, type: 'string' },
    ],
  },

  {
    slug: 'get_channel_messages',
    name: 'Get Channel Messages',
    description: 'Get messages from a Discord channel.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/channels/{channel_id}/messages' },
    parameters: [
      { name: 'channel_id', in: 'path', required: true, type: 'string' },
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 100, default: 50 },
    ],
  },

  // ── Messages ──────────────────────────────────────────────────────────────

  {
    slug: 'send_message',
    name: 'Send Message',
    description: 'Send a message to a Discord channel.',
    risk_level: ['WRITE', 'EXTERNAL_COMMUNICATION'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/channels/{channel_id}/messages',
      body_schema: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Message content (max 2000 chars)' },
        },
      },
    },
    parameters: [
      { name: 'channel_id', in: 'path', required: true, type: 'string' },
      { name: 'content', in: 'body', required: true, type: 'string' },
    ],
  },

  // ── Members ───────────────────────────────────────────────────────────────

  {
    slug: 'list_guild_members',
    name: 'List Guild Members',
    description: 'List members of a Discord guild.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/guilds/{guild_id}/members' },
    parameters: [
      { name: 'guild_id', in: 'path', required: true, type: 'string' },
      { name: 'limit', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 1000, default: 100 },
    ],
  },
];

const TOOL_MAP = new Map(DISCORD_TOOLS.map((t) => [t.slug, t]));

export function getDiscordTool(slug: string): ToolDef | undefined {
  return TOOL_MAP.get(slug);
}
