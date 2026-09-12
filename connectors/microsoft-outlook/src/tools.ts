/**
 * Microsoft Outlook connector — tool definitions.
 *
 * Uses Microsoft Graph API v1.0: https://graph.microsoft.com/v1.0
 *
 * SI-05: Tool descriptions are untrusted data — never eval'd or used for routing.
 */

import type { ToolDef } from '@arcane/connector-sdk';

export const OUTLOOK_TOOLS: ToolDef[] = [
  // ── Mail ──────────────────────────────────────────────────────────────────

  {
    slug: 'list_messages',
    name: 'List Messages',
    description: 'List email messages in the user\'s mailbox.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/me/messages' },
    parameters: [
      { name: '$top', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 1000, default: 50, description: 'Number of messages to return' },
      { name: '$skip', in: 'query', required: false, type: 'integer', description: 'Number of messages to skip' },
      { name: '$filter', in: 'query', required: false, type: 'string', description: 'OData filter expression' },
      { name: '$search', in: 'query', required: false, type: 'string', description: 'Search query' },
      { name: '$orderby', in: 'query', required: false, type: 'string', description: 'Sort order (e.g. receivedDateTime desc)' },
      { name: '$select', in: 'query', required: false, type: 'string', description: 'Comma-separated fields to return' },
    ],
  },

  {
    slug: 'get_message',
    name: 'Get Message',
    description: 'Get a specific email message by ID.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/me/messages/{message_id}' },
    parameters: [
      { name: 'message_id', in: 'path', required: true, type: 'string' },
      { name: '$select', in: 'query', required: false, type: 'string', description: 'Comma-separated fields to return' },
    ],
  },

  {
    slug: 'send_message',
    name: 'Send Message',
    description: 'Send a new email message.',
    risk_level: ['WRITE', 'EXTERNAL_COMMUNICATION'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/me/sendMail',
      body_schema: {
        type: 'object',
        required: ['message'],
        properties: {
          message: {
            type: 'object',
            required: ['subject', 'body', 'toRecipients'],
            properties: {
              subject: { type: 'string' },
              body: {
                type: 'object',
                required: ['contentType', 'content'],
                properties: {
                  contentType: { type: 'string', enum: ['text', 'html'] },
                  content: { type: 'string' },
                },
              },
              toRecipients: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    emailAddress: {
                      type: 'object',
                      properties: {
                        address: { type: 'string' },
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
              ccRecipients: { type: 'array', items: { type: 'object' } },
            },
          },
          saveToSentItems: { type: 'boolean', default: true },
        },
      },
    },
    parameters: [
      { name: 'message', in: 'body', required: true, type: 'object', description: 'The message to send' },
      { name: 'saveToSentItems', in: 'body', required: false, type: 'boolean' },
    ],
  },

  {
    slug: 'reply_to_message',
    name: 'Reply to Message',
    description: 'Reply to an email message.',
    risk_level: ['WRITE', 'EXTERNAL_COMMUNICATION'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/me/messages/{message_id}/reply',
      body_schema: {
        type: 'object',
        required: ['comment'],
        properties: {
          comment: { type: 'string' },
        },
      },
    },
    parameters: [
      { name: 'message_id', in: 'path', required: true, type: 'string' },
      { name: 'comment', in: 'body', required: true, type: 'string', description: 'Reply comment text' },
    ],
  },

  {
    slug: 'move_message',
    name: 'Move Message',
    description: 'Move an email message to a different folder.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/me/messages/{message_id}/move',
      body_schema: {
        type: 'object',
        required: ['destinationId'],
        properties: {
          destinationId: { type: 'string' },
        },
      },
    },
    parameters: [
      { name: 'message_id', in: 'path', required: true, type: 'string' },
      { name: 'destinationId', in: 'body', required: true, type: 'string', description: 'ID or well-known name of destination folder (e.g. inbox, drafts, sentItems, deleteditems)' },
    ],
  },

  {
    slug: 'list_mail_folders',
    name: 'List Mail Folders',
    description: 'List mail folders in the user\'s mailbox.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/me/mailFolders' },
    parameters: [
      { name: '$top', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 250, default: 50 },
    ],
  },

  // ── Calendar ──────────────────────────────────────────────────────────────

  {
    slug: 'list_events',
    name: 'List Calendar Events',
    description: 'List calendar events for the user.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/me/events' },
    parameters: [
      { name: '$top', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 1000, default: 50 },
      { name: '$filter', in: 'query', required: false, type: 'string', description: 'OData filter (e.g. start/dateTime ge \'2024-01-01\')' },
      { name: '$orderby', in: 'query', required: false, type: 'string', description: 'Sort order (e.g. start/dateTime asc)' },
      { name: '$select', in: 'query', required: false, type: 'string', description: 'Comma-separated fields to return' },
    ],
  },

  {
    slug: 'get_event',
    name: 'Get Calendar Event',
    description: 'Get a specific calendar event by ID.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/me/events/{event_id}' },
    parameters: [
      { name: 'event_id', in: 'path', required: true, type: 'string' },
    ],
  },

  {
    slug: 'create_event',
    name: 'Create Calendar Event',
    description: 'Create a new calendar event.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/me/events',
      body_schema: {
        type: 'object',
        required: ['subject', 'start', 'end'],
        properties: {
          subject: { type: 'string' },
          body: { type: 'object', properties: { contentType: { type: 'string' }, content: { type: 'string' } } },
          start: { type: 'object', required: ['dateTime', 'timeZone'], properties: { dateTime: { type: 'string' }, timeZone: { type: 'string' } } },
          end: { type: 'object', required: ['dateTime', 'timeZone'], properties: { dateTime: { type: 'string' }, timeZone: { type: 'string' } } },
          location: { type: 'object', properties: { displayName: { type: 'string' } } },
          attendees: { type: 'array', items: { type: 'object' } },
          isOnlineMeeting: { type: 'boolean' },
        },
      },
    },
    parameters: [
      { name: 'subject', in: 'body', required: true, type: 'string' },
      { name: 'start', in: 'body', required: true, type: 'object', description: 'Start time { dateTime, timeZone }' },
      { name: 'end', in: 'body', required: true, type: 'object', description: 'End time { dateTime, timeZone }' },
      { name: 'body', in: 'body', required: false, type: 'object', description: 'Event body { contentType, content }' },
      { name: 'attendees', in: 'body', required: false, type: 'array', description: 'List of attendees' },
      { name: 'location', in: 'body', required: false, type: 'object' },
      { name: 'isOnlineMeeting', in: 'body', required: false, type: 'boolean' },
    ],
  },
];

const TOOL_MAP = new Map(OUTLOOK_TOOLS.map((t) => [t.slug, t]));

export function getOutlookTool(slug: string): ToolDef | undefined {
  return TOOL_MAP.get(slug);
}
