/**
 * Gmail connector — public surface.
 */

import type { ConnectorDef } from '@arcane/connector-sdk';
import { GMAIL_TOOLS } from './tools.js';

export const GMAIL_CONNECTOR_DEF: ConnectorDef = {
  id: 'gmail',
  slug: 'gmail',
  name: 'Gmail',
  description: 'Read, send, and manage Gmail messages and threads.',
  version: '1.0.0',
  category: 'communication',
  base_url: 'https://gmail.googleapis.com',
  default_headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    type: 'oauth2',
    oauth2: {
      authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_url: 'https://oauth2.googleapis.com/token',
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
      pkce: true,
      refresh_supported: true,
    },
    connect_hint: 'Connect your Google account to read and send Gmail messages.',
  },
  tools: GMAIL_TOOLS,
};

export { GMAIL_TOOLS, getGmailTool } from './tools.js';
export type { ConnectorDef } from '@arcane/connector-sdk';
