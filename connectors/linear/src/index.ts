/**
 * Linear connector — public surface.
 */

import type { ConnectorDef } from '@arcane/connector-sdk';
import { LINEAR_TOOLS } from './tools.js';

export const LINEAR_CONNECTOR_DEF: ConnectorDef = {
  id: 'linear',
  slug: 'linear',
  name: 'Linear',
  description: 'Manage Linear issues, projects, and teams via GraphQL API.',
  version: '1.0.0',
  category: 'developer-tools',
  base_url: 'https://api.linear.app',
  default_headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    type: 'oauth2',
    oauth2: {
      authorization_url: 'https://linear.app/oauth/authorize',
      token_url: 'https://api.linear.app/oauth/token',
      scopes: ['read', 'write', 'issues:create'],
      pkce: true,
      refresh_supported: false,
    },
    connect_hint: 'Connect your Linear workspace to manage issues and projects.',
  },
  tools: LINEAR_TOOLS,
};

export { LINEAR_TOOLS, getLinearTool } from './tools.js';
export type { ConnectorDef } from '@arcane/connector-sdk';
