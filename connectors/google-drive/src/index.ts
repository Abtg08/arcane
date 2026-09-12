/**
 * Google Drive connector — public surface.
 */

import type { ConnectorDef } from '@arcane/connector-sdk';
import { GOOGLE_DRIVE_TOOLS } from './tools.js';

export const GOOGLE_DRIVE_CONNECTOR_DEF: ConnectorDef = {
  id: 'google-drive',
  slug: 'google-drive',
  name: 'Google Drive',
  description: 'Manage files and folders in Google Drive.',
  version: '1.0.0',
  category: 'storage',
  base_url: 'https://www.googleapis.com/drive/v3',
  default_headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    type: 'oauth2',
    oauth2: {
      authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_url: 'https://oauth2.googleapis.com/token',
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file',
      ],
      pkce: true,
      refresh_supported: true,
    },
    connect_hint: 'Connect your Google account to manage Drive files and folders.',
  },
  tools: GOOGLE_DRIVE_TOOLS,
};

export { GOOGLE_DRIVE_TOOLS, getGoogleDriveTool } from './tools.js';
export type { ConnectorDef } from '@arcane/connector-sdk';
