/**
 * Development seed script.
 *
 * Creates a minimal but complete fixture set:
 *   - 1 organization + 1 project + 1 environment
 *   - 1 API key (printed to stdout — save it)
 *   - 2 toolkits (github, slack) with 1 tool + 1 published version each
 *   - 1 auth_config per toolkit
 *
 * Run: pnpm db:seed
 * Idempotent: re-running is safe (uses ON CONFLICT DO NOTHING).
 */

import pg from 'pg';
import { createHash, randomBytes } from 'node:crypto';

const { Pool } = pg;

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) {
  console.error('[seed] DATABASE_URL required');
  process.exit(1);
}

// ── UUIDv7 (time-ordered) ─────────────────────────────────────────────────────
function uuidv7(): string {
  const now = BigInt(Date.now());
  const hi = (now >> 16n) & 0xffffffffffffn;
  const mid = now & 0xffffn;
  const rand = randomBytes(10);
  rand[0] = (rand[0]! & 0x0f) | 0x70; // version 7
  rand[2] = (rand[2]! & 0x3f) | 0x80; // variant
  const hiHex = hi.toString(16).padStart(12, '0');
  const midHex = mid.toString(16).padStart(4, '0');
  const randHex = rand.toString('hex');
  return `${hiHex.slice(0, 8)}-${hiHex.slice(8, 12)}-${midHex}-${randHex.slice(0, 4)}-${randHex.slice(4, 16)}`;
}

function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  const client = await pool.connect();

  try {
    // ── IDs ───────────────────────────────────────────────────────────────────
    const orgId = uuidv7();
    const projectId = uuidv7();
    const envId = uuidv7();
    const apiKeyId = uuidv7();
    const githubToolkitId = uuidv7();
    const slackToolkitId = uuidv7();
    const githubToolkitVersionId = uuidv7();
    const slackToolkitVersionId = uuidv7();
    const githubAuthConfigId = uuidv7();
    const slackAuthConfigId = uuidv7();
    const githubToolId = uuidv7();
    const slackToolId = uuidv7();
    const githubToolVersionId = uuidv7();
    const slackToolVersionId = uuidv7();

    // ── API key ───────────────────────────────────────────────────────────────
    const apiKeySecret = randomBytes(32).toString('hex');
    const apiKeyPlaintext = `arc_live_${apiKeySecret}`;
    const apiKeyHash = hashApiKey(apiKeyPlaintext);
    const apiKeyPrefix = `arc_live_${apiKeySecret.slice(0, 8)}`;

    await client.query('BEGIN');

    // ── Organization ──────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO organizations (id, name, slug, status)
       VALUES ($1, 'Acme Corp', 'acme', 'ACTIVE')
       ON CONFLICT (slug) DO NOTHING`,
      [orgId],
    );

    const { rows: orgRows } = await client.query<{ id: string }>(
      `SELECT id FROM organizations WHERE slug = 'acme'`,
    );
    const resolvedOrgId = orgRows[0]!.id;

    // ── Project ───────────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO projects (id, organization_id, name, slug, status)
       VALUES ($1, $2, 'Default Project', 'default', 'ACTIVE')
       ON CONFLICT DO NOTHING`,
      [projectId, resolvedOrgId],
    );

    const { rows: projRows } = await client.query<{ id: string }>(
      `SELECT id FROM projects WHERE organization_id = $1 AND slug = 'default'`,
      [resolvedOrgId],
    );
    const resolvedProjectId = projRows[0]!.id;

    // ── Environment ───────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO environments (id, project_id, name, slug, type, status)
       VALUES ($1, $2, 'Development', 'dev', 'DEVELOPMENT', 'ACTIVE')
       ON CONFLICT DO NOTHING`,
      [envId, resolvedProjectId],
    );

    const { rows: envRows } = await client.query<{ id: string }>(
      `SELECT id FROM environments WHERE project_id = $1 AND slug = 'dev'`,
      [resolvedProjectId],
    );
    const resolvedEnvId = envRows[0]!.id;

    // ── API key ───────────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO api_keys
         (id, environment_id, name, key_hash, key_prefix, permissions)
       VALUES ($1, $2, 'Dev Key', $3, $4, '["READ","WRITE","EXECUTE"]')
       ON CONFLICT DO NOTHING`,
      [apiKeyId, resolvedEnvId, apiKeyHash, apiKeyPrefix],
    );

    // ── GitHub toolkit ────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO toolkits (id, slug, name, description, category, status)
       VALUES ($1, 'github', 'GitHub', 'GitHub API integration', 'DEVELOPER_TOOLS', 'ACTIVE')
       ON CONFLICT (slug) DO NOTHING`,
      [githubToolkitId],
    );

    const { rows: ghRows } = await client.query<{ id: string }>(
      `SELECT id FROM toolkits WHERE slug = 'github'`,
    );
    const resolvedGithubToolkitId = ghRows[0]!.id;

    await client.query(
      `INSERT INTO toolkit_versions (id, toolkit_id, version, manifest, status, published_at)
       VALUES ($1, $2, '1.0.0', $3, 'PUBLISHED', NOW())
       ON CONFLICT (toolkit_id, version) DO NOTHING`,
      [githubToolkitVersionId, resolvedGithubToolkitId, JSON.stringify({ version: '1.0.0', tools: ['list_repos'] })],
    );

    const { rows: ghVersionRows } = await client.query<{ id: string }>(
      `SELECT id FROM toolkit_versions WHERE toolkit_id = $1 AND version = '1.0.0'`,
      [resolvedGithubToolkitId],
    );
    const resolvedGithubToolkitVersionId = ghVersionRows[0]!.id;

    await client.query(
      `INSERT INTO auth_configs (id, toolkit_id, name, auth_type, configuration_schema, authorization_config)
       VALUES ($1, $2, 'GitHub OAuth', 'OAUTH2', $3, $4)
       ON CONFLICT DO NOTHING`,
      [
        githubAuthConfigId,
        resolvedGithubToolkitId,
        JSON.stringify({ type: 'object', properties: {} }),
        JSON.stringify({
          authorization_url: 'https://github.com/login/oauth/authorize',
          token_url: 'https://github.com/login/oauth/access_token',
          client_id: process.env['GITHUB_CLIENT_ID'] ?? 'YOUR_GITHUB_CLIENT_ID',
          default_scopes: ['repo', 'read:user'],
        }),
      ],
    );

    await client.query(
      `INSERT INTO tools (id, toolkit_id, slug, name, description, status)
       VALUES ($1, $2, 'list_repos', 'List Repositories', 'List repositories for the authenticated user', 'ACTIVE')
       ON CONFLICT DO NOTHING`,
      [githubToolId, resolvedGithubToolkitId],
    );

    const { rows: ghToolRows } = await client.query<{ id: string }>(
      `SELECT id FROM tools WHERE toolkit_id = $1 AND slug = 'list_repos'`,
      [resolvedGithubToolkitId],
    );
    const resolvedGithubToolId = ghToolRows[0]!.id;

    await client.query(
      `INSERT INTO tool_versions
         (id, tool_id, toolkit_version_id, version, status, input_schema, output_schema, execution_definition, risk_level, read_only, destructive, idempotent)
       VALUES ($1, $2, $3, 1, 'PUBLISHED', $4, $5, $6, '["READ_ONLY"]'::jsonb, true, false, true)
       ON CONFLICT DO NOTHING`,
      [
        githubToolVersionId,
        resolvedGithubToolId,
        resolvedGithubToolkitVersionId,
        JSON.stringify({
          type: 'object',
          properties: {
            per_page: { type: 'number', default: 30, maximum: 100 },
            page: { type: 'number', default: 1 },
            type: { type: 'string', enum: ['all', 'owner', 'public', 'private'], default: 'owner' },
          },
        }),
        JSON.stringify({
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              full_name: { type: 'string' },
              private: { type: 'boolean' },
              html_url: { type: 'string' },
            },
          },
        }),
        JSON.stringify({ type: 'http', method: 'GET', path: '/user/repos' }),
      ],
    );

    // ── Slack toolkit ─────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO toolkits (id, slug, name, description, category, status)
       VALUES ($1, 'slack', 'Slack', 'Slack messaging integration', 'COMMUNICATION', 'ACTIVE')
       ON CONFLICT (slug) DO NOTHING`,
      [slackToolkitId],
    );

    const { rows: slackRows } = await client.query<{ id: string }>(
      `SELECT id FROM toolkits WHERE slug = 'slack'`,
    );
    const resolvedSlackToolkitId = slackRows[0]!.id;

    await client.query(
      `INSERT INTO toolkit_versions (id, toolkit_id, version, manifest, status, published_at)
       VALUES ($1, $2, '1.0.0', $3, 'PUBLISHED', NOW())
       ON CONFLICT (toolkit_id, version) DO NOTHING`,
      [slackToolkitVersionId, resolvedSlackToolkitId, JSON.stringify({ version: '1.0.0', tools: ['send_message'] })],
    );

    const { rows: slackVersionRows } = await client.query<{ id: string }>(
      `SELECT id FROM toolkit_versions WHERE toolkit_id = $1 AND version = '1.0.0'`,
      [resolvedSlackToolkitId],
    );
    const resolvedSlackToolkitVersionId = slackVersionRows[0]!.id;

    await client.query(
      `INSERT INTO auth_configs (id, toolkit_id, name, auth_type, configuration_schema, authorization_config)
       VALUES ($1, $2, 'Slack OAuth', 'OAUTH2', $3, $4)
       ON CONFLICT DO NOTHING`,
      [
        slackAuthConfigId,
        resolvedSlackToolkitId,
        JSON.stringify({ type: 'object', properties: {} }),
        JSON.stringify({
          authorization_url: 'https://slack.com/oauth/v2/authorize',
          token_url: 'https://slack.com/api/oauth.v2.access',
          client_id: process.env['SLACK_CLIENT_ID'] ?? 'YOUR_SLACK_CLIENT_ID',
          default_scopes: ['channels:read', 'chat:write'],
        }),
      ],
    );

    await client.query(
      `INSERT INTO tools (id, toolkit_id, slug, name, description, status)
       VALUES ($1, $2, 'send_message', 'Send Message', 'Send a message to a Slack channel', 'ACTIVE')
       ON CONFLICT DO NOTHING`,
      [slackToolId, resolvedSlackToolkitId],
    );

    const { rows: slackToolRows } = await client.query<{ id: string }>(
      `SELECT id FROM tools WHERE toolkit_id = $1 AND slug = 'send_message'`,
      [resolvedSlackToolkitId],
    );
    const resolvedSlackToolId = slackToolRows[0]!.id;

    await client.query(
      `INSERT INTO tool_versions
         (id, tool_id, toolkit_version_id, version, status, input_schema, output_schema, execution_definition, risk_level, read_only, destructive, idempotent)
       VALUES ($1, $2, $3, 1, 'PUBLISHED', $4, $5, $6, '["WRITE", "EXTERNAL_COMMUNICATION"]'::jsonb, false, false, false)
       ON CONFLICT DO NOTHING`,
      [
        slackToolVersionId,
        resolvedSlackToolId,
        resolvedSlackToolkitVersionId,
        JSON.stringify({
          type: 'object',
          required: ['channel', 'text'],
          properties: {
            channel: { type: 'string', description: 'Channel ID or name' },
            text: { type: 'string', description: 'Message text' },
          },
        }),
        JSON.stringify({
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            ts: { type: 'string' },
            channel: { type: 'string' },
          },
        }),
        JSON.stringify({ type: 'http', method: 'POST', path: '/chat.postMessage' }),
      ],
    );

    await client.query('COMMIT');

    console.log('\n✅ Seed complete\n');
    console.log('─────────────────────────────────────────────');
    console.log('Environment ID:', resolvedEnvId);
    console.log('API Key (save this — shown only once):');
    console.log(`  ${apiKeyPlaintext}`);
    console.log('─────────────────────────────────────────────');
    console.log('\nToolkits seeded: github, slack');
    console.log('Tools seeded:    github/list_repos, slack/send_message\n');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
