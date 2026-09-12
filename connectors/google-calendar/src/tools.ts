/**
 * Google Calendar connector — tool definitions.
 * SI-05: Tool descriptions are untrusted data — never eval'd or used for routing.
 */

import type { ToolDef } from '@arcane/connector-sdk';

export const GOOGLE_CALENDAR_TOOLS: ToolDef[] = [
  // ── Calendars ─────────────────────────────────────────────────────────────

  {
    slug: 'list_calendars',
    name: 'List Calendars',
    description: "List all calendars on the user's calendar list.",
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/calendar/v3/users/me/calendarList' },
    parameters: [
      { name: 'maxResults', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 250, default: 100 },
    ],
  },

  {
    slug: 'get_calendar',
    name: 'Get Calendar',
    description: 'Get a specific calendar.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/calendar/v3/calendars/{calendarId}' },
    parameters: [
      { name: 'calendarId', in: 'path', required: true, type: 'string', description: 'Calendar ID or "primary"' },
    ],
  },

  // ── Events ────────────────────────────────────────────────────────────────

  {
    slug: 'list_events',
    name: 'List Events',
    description: 'List events on a calendar.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/calendar/v3/calendars/{calendarId}/events' },
    parameters: [
      { name: 'calendarId', in: 'path', required: true, type: 'string', description: 'Calendar ID or "primary"' },
      { name: 'timeMin', in: 'query', required: false, type: 'string', description: 'RFC3339 timestamp lower bound' },
      { name: 'timeMax', in: 'query', required: false, type: 'string', description: 'RFC3339 timestamp upper bound' },
      { name: 'maxResults', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 2500, default: 250 },
      { name: 'q', in: 'query', required: false, type: 'string', description: 'Free text search query' },
      { name: 'singleEvents', in: 'query', required: false, type: 'boolean', default: true },
      { name: 'orderBy', in: 'query', required: false, type: 'string', enum: ['startTime', 'updated'], default: 'startTime' },
    ],
  },

  {
    slug: 'get_event',
    name: 'Get Event',
    description: 'Get a specific calendar event.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/calendar/v3/calendars/{calendarId}/events/{eventId}' },
    parameters: [
      { name: 'calendarId', in: 'path', required: true, type: 'string' },
      { name: 'eventId', in: 'path', required: true, type: 'string' },
    ],
  },

  {
    slug: 'create_event',
    name: 'Create Event',
    description: 'Create a new calendar event.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/calendar/v3/calendars/{calendarId}/events',
      body_schema: {
        type: 'object',
        required: ['summary', 'start', 'end'],
        properties: {
          summary: { type: 'string', description: 'Event title' },
          description: { type: 'string' },
          location: { type: 'string' },
          start: {
            type: 'object',
            required: ['dateTime'],
            properties: {
              dateTime: { type: 'string', description: 'RFC3339 timestamp' },
              timeZone: { type: 'string' },
            },
          },
          end: {
            type: 'object',
            required: ['dateTime'],
            properties: {
              dateTime: { type: 'string', description: 'RFC3339 timestamp' },
              timeZone: { type: 'string' },
            },
          },
          attendees: {
            type: 'array',
            items: {
              type: 'object',
              properties: { email: { type: 'string' } },
            },
          },
        },
      },
    },
    parameters: [
      { name: 'calendarId', in: 'path', required: true, type: 'string' },
      { name: 'summary', in: 'body', required: true, type: 'string' },
      { name: 'description', in: 'body', required: false, type: 'string' },
      { name: 'location', in: 'body', required: false, type: 'string' },
      { name: 'start', in: 'body', required: true, type: 'object' },
      { name: 'end', in: 'body', required: true, type: 'object' },
      { name: 'attendees', in: 'body', required: false, type: 'array', items: { type: 'object' } },
    ],
  },

  {
    slug: 'update_event',
    name: 'Update Event',
    description: 'Update an existing calendar event.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: true,
    http: {
      method: 'PATCH',
      path: '/calendar/v3/calendars/{calendarId}/events/{eventId}',
      body_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          description: { type: 'string' },
          location: { type: 'string' },
          start: { type: 'object' },
          end: { type: 'object' },
        },
      },
    },
    parameters: [
      { name: 'calendarId', in: 'path', required: true, type: 'string' },
      { name: 'eventId', in: 'path', required: true, type: 'string' },
      { name: 'summary', in: 'body', required: false, type: 'string' },
      { name: 'description', in: 'body', required: false, type: 'string' },
      { name: 'start', in: 'body', required: false, type: 'object' },
      { name: 'end', in: 'body', required: false, type: 'object' },
    ],
  },

  {
    slug: 'delete_event',
    name: 'Delete Event',
    description: 'Delete a calendar event.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: true,
    idempotent: true,
    http: { method: 'DELETE', path: '/calendar/v3/calendars/{calendarId}/events/{eventId}' },
    parameters: [
      { name: 'calendarId', in: 'path', required: true, type: 'string' },
      { name: 'eventId', in: 'path', required: true, type: 'string' },
    ],
  },
];

const TOOL_MAP = new Map(GOOGLE_CALENDAR_TOOLS.map((t) => [t.slug, t]));

export function getGoogleCalendarTool(slug: string): ToolDef | undefined {
  return TOOL_MAP.get(slug);
}
