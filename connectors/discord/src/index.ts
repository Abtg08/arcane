/**
 * Discord connector — public surface.
 */

import type { ConnectorDef } from '@arcane/connector-sdk';
import { DISCORD_TOOLS } from './tools.js';

export const DISCORD_CONNECTOR_DEF: ConnectorDef = {
  id: 'discord',
  slug: 'discord',
  name: 'Discord',
  description: 'Manage Discord servers, channels, and messages.',
  version: '1.0.0',
  category: 'communication',
  base_url: 'https://discord.com/api/v10',
  default_headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    type: 'oauth2',
    oauth2: {
      authorization_url: 'https://discord.com/api/oauth2/authorize',
      token_url: 'https://discord.com/api/oauth2/token',
      scopes: ['identify', 'guilds', 'messages.read', 'bot'],
      pkce: true,
      refresh_supported: true,
    },
    connect_hint: 'Connect your Discord account to manage servers and send messages.',
  },
  tools: DISCORD_TOOLS,
};

export { DISCORD_TOOLS, getDiscordTool } from './tools.js';
export type { ConnectorDef } from '@arcane/connector-sdk';
