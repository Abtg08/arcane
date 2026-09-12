/**
 * Linear connector — tool definitions.
 *
 * Linear uses GraphQL. Tools map to GraphQL operations via a POST to /graphql.
 * The `path` is always `/graphql`; the operation is passed in body_schema.
 *
 * SI-05: Tool descriptions are untrusted data — never eval'd or used for routing.
 */

import type { ToolDef } from '@arcane/connector-sdk';

export const LINEAR_TOOLS: ToolDef[] = [
  // ── Issues ────────────────────────────────────────────────────────────────

  {
    slug: 'list_issues',
    name: 'List Issues',
    description: 'List Linear issues with optional filtering by team, state, or assignee.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'POST',
      path: '/graphql',
      body_schema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'GraphQL query string' },
          variables: { type: 'object', description: 'GraphQL variables' },
        },
      },
    },
    parameters: [
      { name: 'query', in: 'body', required: true, type: 'string', description: 'GraphQL query' },
      { name: 'variables', in: 'body', required: false, type: 'object' },
    ],
  },

  {
    slug: 'get_issue',
    name: 'Get Issue',
    description: 'Get a specific Linear issue by ID.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'POST',
      path: '/graphql',
      body_schema: {
        type: 'object',
        required: ['query', 'variables'],
        properties: {
          query: { type: 'string' },
          variables: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
          },
        },
      },
    },
    parameters: [
      { name: 'query', in: 'body', required: true, type: 'string' },
      { name: 'variables', in: 'body', required: true, type: 'object' },
    ],
  },

  {
    slug: 'create_issue',
    name: 'Create Issue',
    description: 'Create a new Linear issue.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/graphql',
      body_schema: {
        type: 'object',
        required: ['query', 'variables'],
        properties: {
          query: { type: 'string', description: 'GraphQL mutation string' },
          variables: {
            type: 'object',
            required: ['input'],
            properties: {
              input: {
                type: 'object',
                required: ['title', 'teamId'],
                properties: {
                  title: { type: 'string' },
                  teamId: { type: 'string' },
                  description: { type: 'string' },
                  priority: { type: 'integer', minimum: 0, maximum: 4 },
                  assigneeId: { type: 'string' },
                  stateId: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    parameters: [
      { name: 'query', in: 'body', required: true, type: 'string' },
      { name: 'variables', in: 'body', required: true, type: 'object' },
    ],
  },

  {
    slug: 'update_issue',
    name: 'Update Issue',
    description: 'Update an existing Linear issue.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: true,
    http: {
      method: 'POST',
      path: '/graphql',
      body_schema: {
        type: 'object',
        required: ['query', 'variables'],
        properties: {
          query: { type: 'string' },
          variables: {
            type: 'object',
            required: ['id', 'input'],
            properties: {
              id: { type: 'string' },
              input: { type: 'object' },
            },
          },
        },
      },
    },
    parameters: [
      { name: 'query', in: 'body', required: true, type: 'string' },
      { name: 'variables', in: 'body', required: true, type: 'object' },
    ],
  },

  // ── Projects ──────────────────────────────────────────────────────────────

  {
    slug: 'list_projects',
    name: 'List Projects',
    description: 'List Linear projects.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'POST',
      path: '/graphql',
      body_schema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
          variables: { type: 'object' },
        },
      },
    },
    parameters: [
      { name: 'query', in: 'body', required: true, type: 'string' },
      { name: 'variables', in: 'body', required: false, type: 'object' },
    ],
  },

  // ── Teams ─────────────────────────────────────────────────────────────────

  {
    slug: 'list_teams',
    name: 'List Teams',
    description: 'List Linear teams in the organization.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'POST',
      path: '/graphql',
      body_schema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
        },
      },
    },
    parameters: [
      { name: 'query', in: 'body', required: true, type: 'string' },
    ],
  },

  // ── Users ─────────────────────────────────────────────────────────────────

  {
    slug: 'list_users',
    name: 'List Users',
    description: 'List members of the Linear organization.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'POST',
      path: '/graphql',
      body_schema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string' },
        },
      },
    },
    parameters: [
      { name: 'query', in: 'body', required: true, type: 'string' },
    ],
  },
];

const TOOL_MAP = new Map(LINEAR_TOOLS.map((t) => [t.slug, t]));

export function getLinearTool(slug: string): ToolDef | undefined {
  return TOOL_MAP.get(slug);
}
