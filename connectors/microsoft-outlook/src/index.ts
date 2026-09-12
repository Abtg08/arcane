/**
 * Microsoft Outlook connector — public surface.
 */

import type { ConnectorDef } from '@arcane/connector-sdk';
import { OUTLOOK_TOOLS } from './tools.js';

export const OUTLOOK_CONNECTOR_DEF: ConnectorDef = {
  id: 'microsoft-outlook',
  slug: 'microsoft-outlook',
  name: 'Microsoft Outlook',
  description: 'Read and send emails, manage calendar events in Microsoft Outlook via Microsoft Graph.',
  version: '1.0.0',
  category: 'email',
  base_url: 'https://graph.microsoft.com/v1.0',
  default_headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    type: 'oauth2',
    oauth2: {
      authorization_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: ['Mail.Read', 'Mail.Send', 'Mail.ReadWrite', 'Calendars.Read', 'Calendars.ReadWrite', 'offline_access'],
      pkce: true,
      refresh_supported: true,
    },
    connect_hint: 'Connect your Microsoft account to read and send Outlook emails and manage calendar events.',
  },
  tools: OUTLOOK_TOOLS,
};

export { OUTLOOK_TOOLS, getOutlookTool } from './tools.js';
export type { ConnectorDef } from '@arcane/connector-sdk';
