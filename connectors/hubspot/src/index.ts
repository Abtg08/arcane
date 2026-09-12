/**
 * HubSpot connector — public surface.
 */

import type { ConnectorDef } from '@arcane/connector-sdk';
import { HUBSPOT_TOOLS } from './tools.js';

export const HUBSPOT_CONNECTOR_DEF: ConnectorDef = {
  id: 'hubspot',
  slug: 'hubspot',
  name: 'HubSpot',
  description: 'Manage contacts, deals, and companies in HubSpot CRM.',
  version: '1.0.0',
  category: 'crm',
  base_url: 'https://api.hubapi.com',
  default_headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    type: 'oauth2',
    oauth2: {
      authorization_url: 'https://app.hubspot.com/oauth/authorize',
      token_url: 'https://api.hubapi.com/oauth/v1/token',
      scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write', 'crm.objects.deals.read', 'crm.objects.companies.read'],
      pkce: false,
      refresh_supported: true,
    },
    connect_hint: 'Connect your HubSpot account to manage CRM contacts, deals, and companies.',
  },
  tools: HUBSPOT_TOOLS,
};

export { HUBSPOT_TOOLS, getHubSpotTool } from './tools.js';
export type { ConnectorDef } from '@arcane/connector-sdk';
