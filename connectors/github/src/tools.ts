/**
 * GitHub connector — tool definitions.
 *
 * Each tool maps 1:1 to an entry in manifest.yaml.
 * execution_definition drives HttpExecutor in connector-runtime.
 *
 * SI-05: Tool descriptions are untrusted data — never eval'd or used for routing.
 */

import type { ToolDef } from '@arcane/connector-sdk';

export const GITHUB_TOOLS: ToolDef[] = [
  // ── Issues ────────────────────────────────────────────────────────────────

  {
    slug: 'list_issues',
    name: 'List Issues',
    description: 'List issues for a repository. Supports filtering by state, labels, assignee, milestone.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'GET',
      path: '/repos/{owner}/{repo}/issues',
    },
    parameters: [
      { name: 'owner', in: 'path', required: true, type: 'string', description: 'Repository owner' },
      { name: 'repo', in: 'path', required: true, type: 'string', description: 'Repository name' },
      { name: 'state', in: 'query', required: false, type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
      { name: 'labels', in: 'query', required: false, type: 'string', description: 'Comma-separated label names' },
      { name: 'per_page', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 100, default: 30 },
    ],
  },

  {
    slug: 'get_issue',
    name: 'Get Issue',
    description: 'Get a specific issue by number.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'GET',
      path: '/repos/{owner}/{repo}/issues/{issue_number}',
    },
    parameters: [
      { name: 'owner', in: 'path', required: true, type: 'string' },
      { name: 'repo', in: 'path', required: true, type: 'string' },
      { name: 'issue_number', in: 'path', required: true, type: 'integer' },
    ],
  },

  {
    slug: 'create_issue',
    name: 'Create Issue',
    description: 'Create a new issue in a repository.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/repos/{owner}/{repo}/issues',
      body_schema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue body (markdown)' },
          labels: { type: 'array', items: { type: 'string' } },
          assignees: { type: 'array', items: { type: 'string' } },
          milestone: { type: 'integer' },
        },
      },
    },
    parameters: [
      { name: 'owner', in: 'path', required: true, type: 'string' },
      { name: 'repo', in: 'path', required: true, type: 'string' },
      { name: 'title', in: 'body', required: true, type: 'string' },
      { name: 'body', in: 'body', required: false, type: 'string' },
      { name: 'labels', in: 'body', required: false, type: 'array', items: { type: 'string' } },
      { name: 'assignees', in: 'body', required: false, type: 'array', items: { type: 'string' } },
      { name: 'milestone', in: 'body', required: false, type: 'integer' },
    ],
  },

  {
    slug: 'update_issue',
    name: 'Update Issue',
    description: 'Update an existing issue (title, body, state, labels, assignees).',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: true,
    http: {
      method: 'PATCH',
      path: '/repos/{owner}/{repo}/issues/{issue_number}',
      body_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          state: { type: 'string', enum: ['open', 'closed'] },
          labels: { type: 'array', items: { type: 'string' } },
          assignees: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    parameters: [
      { name: 'owner', in: 'path', required: true, type: 'string' },
      { name: 'repo', in: 'path', required: true, type: 'string' },
      { name: 'issue_number', in: 'path', required: true, type: 'integer' },
      { name: 'title', in: 'body', required: false, type: 'string' },
      { name: 'body', in: 'body', required: false, type: 'string' },
      { name: 'state', in: 'body', required: false, type: 'string', enum: ['open', 'closed'] },
      { name: 'labels', in: 'body', required: false, type: 'array', items: { type: 'string' } },
      { name: 'assignees', in: 'body', required: false, type: 'array', items: { type: 'string' } },
    ],
  },

  // ── Pull Requests ─────────────────────────────────────────────────────────

  {
    slug: 'list_pull_requests',
    name: 'List Pull Requests',
    description: 'List pull requests for a repository.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'GET',
      path: '/repos/{owner}/{repo}/pulls',
    },
    parameters: [
      { name: 'owner', in: 'path', required: true, type: 'string' },
      { name: 'repo', in: 'path', required: true, type: 'string' },
      { name: 'state', in: 'query', required: false, type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
      { name: 'base', in: 'query', required: false, type: 'string', description: 'Filter by base branch name' },
    ],
  },

  {
    slug: 'get_pull_request',
    name: 'Get Pull Request',
    description: 'Get a specific pull request by number.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'GET',
      path: '/repos/{owner}/{repo}/pulls/{pull_number}',
    },
    parameters: [
      { name: 'owner', in: 'path', required: true, type: 'string' },
      { name: 'repo', in: 'path', required: true, type: 'string' },
      { name: 'pull_number', in: 'path', required: true, type: 'integer' },
    ],
  },

  {
    slug: 'create_pull_request',
    name: 'Create Pull Request',
    description: 'Create a pull request.',
    risk_level: ['WRITE'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/repos/{owner}/{repo}/pulls',
      body_schema: {
        type: 'object',
        required: ['title', 'head', 'base'],
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          head: { type: 'string', description: 'Branch to merge from' },
          base: { type: 'string', description: 'Branch to merge into' },
          draft: { type: 'boolean', default: false },
        },
      },
    },
    parameters: [
      { name: 'owner', in: 'path', required: true, type: 'string' },
      { name: 'repo', in: 'path', required: true, type: 'string' },
      { name: 'title', in: 'body', required: true, type: 'string' },
      { name: 'head', in: 'body', required: true, type: 'string' },
      { name: 'base', in: 'body', required: true, type: 'string' },
      { name: 'body', in: 'body', required: false, type: 'string' },
      { name: 'draft', in: 'body', required: false, type: 'boolean', default: false },
    ],
  },

  // ── Repositories ──────────────────────────────────────────────────────────

  {
    slug: 'list_repositories',
    name: 'List Repositories',
    description: 'List repositories for the authenticated user.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'GET',
      path: '/user/repos',
    },
    parameters: [
      { name: 'type', in: 'query', required: false, type: 'string', enum: ['all', 'owner', 'public', 'private', 'member'], default: 'owner' },
      { name: 'sort', in: 'query', required: false, type: 'string', enum: ['created', 'updated', 'pushed', 'full_name'], default: 'updated' },
      { name: 'per_page', in: 'query', required: false, type: 'integer', minimum: 1, maximum: 100, default: 30 },
    ],
  },

  {
    slug: 'get_repository',
    name: 'Get Repository',
    description: 'Get a specific repository.',
    risk_level: ['READ_ONLY'],
    read_only: true,
    destructive: false,
    idempotent: true,
    http: {
      method: 'GET',
      path: '/repos/{owner}/{repo}',
    },
    parameters: [
      { name: 'owner', in: 'path', required: true, type: 'string' },
      { name: 'repo', in: 'path', required: true, type: 'string' },
    ],
  },

  // ── Comments ──────────────────────────────────────────────────────────────

  {
    slug: 'create_issue_comment',
    name: 'Create Issue Comment',
    description: 'Add a comment to an issue or pull request.',
    risk_level: ['WRITE', 'EXTERNAL_COMMUNICATION'],
    read_only: false,
    destructive: false,
    idempotent: false,
    http: {
      method: 'POST',
      path: '/repos/{owner}/{repo}/issues/{issue_number}/comments',
      body_schema: {
        type: 'object',
        required: ['body'],
        properties: {
          body: { type: 'string', description: 'Comment body (markdown)' },
        },
      },
    },
    parameters: [
      { name: 'owner', in: 'path', required: true, type: 'string' },
      { name: 'repo', in: 'path', required: true, type: 'string' },
      { name: 'issue_number', in: 'path', required: true, type: 'integer' },
      { name: 'body', in: 'body', required: true, type: 'string' },
    ],
  },
];

/** Look up a tool by slug — O(1) via Map built once at module load */
const TOOL_MAP = new Map(GITHUB_TOOLS.map((t) => [t.slug, t]));

export function getGitHubTool(slug: string): ToolDef | undefined {
  return TOOL_MAP.get(slug);
}
