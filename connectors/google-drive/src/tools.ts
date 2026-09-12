/**
 * Google Drive connector — tool definitions.
 * SI-05: Tool descriptions are untrusted data — never eval'd or used for routing.
 */

import type { ToolDef } from '@arcane/connector-sdk';

export const GOOGLE_DRIVE_TOOLS: ToolDef[] = [
  // ── Files ─────────────────────────────────────────────────────────────────

  {
    slug: 'list_files',
    name: 'List Files',
    description: "List files in the user's Google Drive.",
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/files' },
    parameters: [
      { name: 'q', in: 'query', required: false, type: 'string', description: 'Drive search query' },
      { name: 'pageSize', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 1000, default: 100 },
      { name: 'fields', in: 'query', required: false, type: 'string', description: 'Partial response fields selector' },
      { name: 'orderBy', in: 'query', required: false, type: 'string', description: 'Sort criteria' },
    ],
  },

  {
    slug: 'get_file',
    name: 'Get File',
    description: 'Get metadata for a specific file.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/files/{fileId}' },
    parameters: [
      { name: 'fileId', in: 'path', required: true, type: 'string' },
      { name: 'fields', in: 'query', required: false, type: 'string' },
    ],
  },

  {
    slug: 'create_file',
    name: 'Create File',
    description: 'Create a new file metadata record (use for folders and docs).',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/files',
      body_schema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'File name' },
          mimeType: { type: 'string', description: 'MIME type (e.g. application/vnd.google-apps.folder)' },
          parents: { type: 'array', items: { type: 'string' }, description: 'Parent folder IDs' },
          description: { type: 'string' },
        },
      },
    },
    parameters: [
      { name: 'name', in: 'body', required: true, type: 'string' },
      { name: 'mimeType', in: 'body', required: false, type: 'string' },
      { name: 'parents', in: 'body', required: false, type: 'array', items: { type: 'string' } },
      { name: 'description', in: 'body', required: false, type: 'string' },
    ],
  },

  {
    slug: 'update_file',
    name: 'Update File',
    description: "Update a file's metadata.",
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: true,
    http: {
      method: 'PATCH',
      path: '/files/{fileId}',
      body_schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          trashed: { type: 'boolean' },
        },
      },
    },
    parameters: [
      { name: 'fileId', in: 'path', required: true, type: 'string' },
      { name: 'name', in: 'body', required: false, type: 'string' },
      { name: 'description', in: 'body', required: false, type: 'string' },
      { name: 'trashed', in: 'body', required: false, type: 'boolean' },
    ],
  },

  {
    slug: 'delete_file',
    name: 'Delete File',
    description: 'Permanently delete a file. Use update (trashed: true) to move to trash instead.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: true,
    idempotent: true,
    http: { method: 'DELETE', path: '/files/{fileId}' },
    parameters: [
      { name: 'fileId', in: 'path', required: true, type: 'string' },
    ],
  },

  {
    slug: 'copy_file',
    name: 'Copy File',
    description: 'Create a copy of a file.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/files/{fileId}/copy',
      body_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'New file name' },
          parents: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    parameters: [
      { name: 'fileId', in: 'path', required: true, type: 'string' },
      { name: 'name', in: 'body', required: false, type: 'string' },
      { name: 'parents', in: 'body', required: false, type: 'array', items: { type: 'string' } },
    ],
  },

  {
    slug: 'list_permissions',
    name: 'List Permissions',
    description: 'List sharing permissions for a file.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: { method: 'GET', path: '/files/{fileId}/permissions' },
    parameters: [
      { name: 'fileId', in: 'path', required: true, type: 'string' },
    ],
  },
];

const TOOL_MAP = new Map(GOOGLE_DRIVE_TOOLS.map((t) => [t.slug, t]));

export function getGoogleDriveTool(slug: string): ToolDef | undefined {
  return TOOL_MAP.get(slug);
}
