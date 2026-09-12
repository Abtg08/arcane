/**
 * Google Calendar connector — public surface.
 */

import type { ConnectorDef } from '@arcane/connector-sdk';
import { GOOGLE_CALENDAR_TOOLS } from './tools.js';

export const GOOGLE_CALENDAR_CONNECTOR_DEF: ConnectorDef = {
  id: 'google-calendar',
  slug: 'google-calendar',
  name: 'Google Calendar',
  description: 'Manage calendar events and schedules via Google Calendar.',
  version: '1.0.0',
  category: 'productivity',
  base_url: 'https://www.googleapis.com/calendar/v3',
  default_headers: {
    'Content-Type': 'application/json',
  },
  auth: {
    type: 'oauth2',
    oauth2: {
      authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_url: 'https://oauth2.googleapis.com/token',
      scopes: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      pkce: true,
      refresh_supported: true,
    },
    connect_hint: 'Connect your Google account to read and manage calendar events.',
  },
  tools: GOOGLE_CALENDAR_TOOLS,
};

export { GOOGLE_CALENDAR_TOOLS, getGoogleCalendarTool } from './tools.js';
export type { ConnectorDef } from '@arcane/connector-sdk';
