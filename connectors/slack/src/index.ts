/**
 * Slack connector — public surface.
 */

import type { ConnectorDef } from '@arcane/connector-sdk';
import { SLACK_TOOLS } from './tools.js';

export const SLACK_CONNECTOR_DEF: ConnectorDef = {
  id: 'slack',
  slug: 'slack',
  name: 'Slack',
  description: 'Send messages, manage channels, and interact with Slack workspaces.',
  version: '1.0.0',
  category: 'communication',
  base_url: 'https://slack.com/api',
  default_headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    type: 'oauth2',
    oauth2: {
      authorization_url: 'https://slack.com/oauth/v2/authorize',
      token_url: 'https://slack.com/api/oauth.v2.access',
      scopes: ['channels:read', 'channels:history', 'chat:write', 'users:read'],
      pkce: true,
      refresh_supported: false,
    },
    connect_hint: 'Connect your Slack workspace to send messages and read channels.',
  },
  tools: SLACK_TOOLS,
};

export { SLACK_TOOLS, getSlackTool } from './tools.js';
export type { ConnectorDef } from '@arcane/connector-sdk';
