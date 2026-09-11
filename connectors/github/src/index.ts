/**
 * GitHub connector — public surface.
 *
 * Exports the ConnectorDef that connector-runtime uses to wire up auth,
 * validate tool calls, and build HTTP requests.
 */

import type { ConnectorDef } from '@arcane/connector-sdk';
import { GITHUB_TOOLS } from './tools.js';

export const GITHUB_CONNECTOR_DEF: ConnectorDef = {
  id: 'github',
  slug: 'github',
  name: 'GitHub',
  description: 'Interact with GitHub repositories, issues, pull requests, and more.',
  version: '1.0.0',
  category: 'developer-tools',
  base_url: 'https://api.github.com',
  default_headers: {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  auth: {
    type: 'oauth2',
    oauth2: {
      authorization_url: 'https://github.com/login/oauth/authorize',
      token_url: 'https://github.com/login/oauth/access_token',
      scopes: ['repo', 'read:user'],
      pkce: true,
      refresh_supported: false,
    },
    connect_hint: 'Connect your GitHub account to manage repositories, issues, and pull requests.',
  },
  tools: GITHUB_TOOLS,
};

export { GITHUB_TOOLS, getGitHubTool } from './tools.js';
export type { ConnectorDef } from '@arcane/connector-sdk';
