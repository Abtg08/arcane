/**
 * Notion connector — public surface.
 */

import type { ConnectorDef } from '@arcane/connector-sdk';
import { NOTION_TOOLS } from './tools.js';

export const NOTION_CONNECTOR_DEF: ConnectorDef = {
  id: 'notion',
  slug: 'notion',
  name: 'Notion',
  description: 'Search, read, and write Notion pages, databases, and blocks.',
  version: '1.0.0',
  category: 'productivity',
  base_url: 'https://api.notion.com/v1',
  default_headers: {
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  },
  auth: {
    type: 'oauth2',
    oauth2: {
      authorization_url: 'https://api.notion.com/v1/oauth/authorize',
      token_url: 'https://api.notion.com/v1/oauth/token',
      scopes: [],
      pkce: false,
      refresh_supported: false,
    },
    connect_hint: 'Connect your Notion workspace to read and write pages and databases.',
  },
  tools: NOTION_TOOLS,
};

export { NOTION_TOOLS, getNotionTool } from './tools.js';
export type { ConnectorDef } from '@arcane/connector-sdk';
