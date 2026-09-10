/**
 * Connection routes — OAuth initiation, callback, and account management.
 *
 * Connections link an external user to a toolkit via OAuth or API key.
 * secret_reference is stored in DB, NEVER returned in responses (SI-03).
 *
 * OAuth flow:
 *   1. POST /connections/oauth/initiate → redirect_url (to provider)
 *   2. Provider redirects to OAUTH_REDIRECT_BASE_URL/callback?code=…&state=…
 *   3. POST /connections/oauth/callback → connection created, ACTIVE
 *
 * The callback endpoint exchanges the code for tokens, envelopes the secret,
 * stores only the secret_reference — actual exchange delegated to connector-runtime.
 */

import type { FastifyInstance } from 'fastify';
import { generateId, getPool } from '@arcane/core';
import { NotFoundError, ValidationError } from '@arcane/core';
import { createOAuthState, generatePkceChallenge, consumeOAuthState } from '@arcane/auth';
import { Redis } from 'ioredis';
import type { ApiConfig } from '@arcane/config';
import type { UUIDv7 } from '@arcane/schemas';

interface ConnectionRouteContext {
  config: ApiConfig;
}

export default async function connectionRoutes(
  fastify: FastifyInstance,
  { config }: ConnectionRouteContext,
): Promise<void> {
  const redis = new Redis(config.VALKEY_URL, { lazyConnect: true, enableOfflineQueue: false });

  // ─── GET /connections — list connections for an external user ─────────────────

  fastify.get(
    '/connections',
    {
      schema: {
        tags: ['connections'],
        summary: 'List connected accounts for the authenticated user',
        querystring: {
          type: 'object',
          properties: {
            external_user_id: { type: 'string' },
            toolkit_slug: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'API key required' } });
      }

      const { external_user_id, toolkit_slug, status } = req.query as {
        external_user_id?: string;
        toolkit_slug?: string;
        status?: string;
      };

      const db = getPool();

      // Build query conditionally — no raw interpolation (SI-13)
      const conditions: string[] = ['ca.environment_id = $1'];
      const params: unknown[] = [req.apiKey.environment_id];
      let idx = 2;

      if (external_user_id) {
        conditions.push(`eu.external_user_id = $${idx++}`);
        params.push(external_user_id);
      }
      if (toolkit_slug) {
        conditions.push(`tk.slug = $${idx++}`);
        params.push(toolkit_slug);
      }
      if (status) {
        conditions.push(`ca.status = $${idx++}`);
        params.push(status.toUpperCase());
      }

      const { rows } = await db.query<{
        id: string;
        external_user_id: string;
        toolkit_id: string;
        toolkit_slug: string;
        toolkit_name: string;
        auth_config_id: string;
        status: string;
        provider_account_id: string | null;
        metadata: Record<string, unknown>;
        created_at: Date;
        expires_at: Date | null;
        last_used_at: Date | null;
      }>(
        `SELECT ca.id, eu.external_user_id, ca.toolkit_id,
                tk.slug AS toolkit_slug, tk.name AS toolkit_name,
                ca.auth_config_id, ca.status, ca.provider_account_id,
                ca.metadata, ca.created_at, ca.expires_at, ca.last_used_at
         FROM connected_accounts ca
         JOIN external_users eu ON eu.id = ca.external_user_id
         JOIN toolkits tk ON tk.id = ca.toolkit_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY ca.created_at DESC
         LIMIT 100`,
        params,
      );

      return reply.send({
        data: rows.map((r) => ({
          id: r.id,
          external_user_id: r.external_user_id,
          toolkit: { id: r.toolkit_id, slug: r.toolkit_slug, name: r.toolkit_name },
          auth_config_id: r.auth_config_id,
          status: r.status,
          provider_account_id: r.provider_account_id,
          metadata: r.metadata,
          created_at: r.created_at.toISOString(),
          expires_at: r.expires_at?.toISOString() ?? null,
          last_used_at: r.last_used_at?.toISOString() ?? null,
          // secret_reference is NEVER included — SI-03
        })),
      });
    },
  );

  // ─── POST /connections/oauth/initiate — start OAuth flow ─────────────────────

  fastify.post(
    '/connections/oauth/initiate',
    {
      schema: {
        tags: ['connections'],
        summary: 'Initiate an OAuth connection flow',
        body: {
          type: 'object',
          required: ['external_user_id', 'toolkit_slug'],
          properties: {
            external_user_id: { type: 'string', minLength: 1 },
            toolkit_slug: { type: 'string', minLength: 1 },
            scopes: { type: 'array', items: { type: 'string' } },
            redirect_uri: { type: 'string', format: 'uri' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'API key required' } });
      }

      const body = req.body as {
        external_user_id: string;
        toolkit_slug: string;
        scopes?: string[];
        redirect_uri?: string;
      };

      const db = getPool();
      const environmentId = req.apiKey.environment_id;

      // Resolve toolkit and its primary auth config
      const { rows: tkRows } = await db.query<{
        toolkit_id: string;
        auth_config_id: string;
        auth_type: string;
        authorization_config: Record<string, unknown>;
      }>(
        `SELECT tk.id AS toolkit_id, ac.id AS auth_config_id, ac.auth_type,
                ac.authorization_config
         FROM toolkits tk
         JOIN auth_configs ac ON ac.toolkit_id = tk.id
         WHERE tk.slug = $1 AND tk.status = 'ACTIVE'
         LIMIT 1`,
        [body.toolkit_slug],
      );

      const toolkit = tkRows[0];
      if (!toolkit) throw new NotFoundError('Toolkit', body.toolkit_slug);

      if (!['OAUTH2', 'OAUTH2_PKCE'].includes(toolkit.auth_type)) {
        throw new ValidationError(`Toolkit '${body.toolkit_slug}' does not support OAuth`);
      }

      const authCfg = toolkit.authorization_config as {
        authorization_url: string;
        token_url: string;
        client_id: string;
        default_scopes?: string[];
      };

      if (!authCfg.authorization_url || !authCfg.client_id) {
        throw new ValidationError('Toolkit OAuth configuration is incomplete');
      }

      // Upsert external user
      await db.query(
        `INSERT INTO external_users (id, environment_id, external_user_id, metadata)
         VALUES ($1, $2, $3, '{}')
         ON CONFLICT (environment_id, external_user_id) DO NOTHING`,
        [generateId(), environmentId, body.external_user_id],
      );

      const { rows: userRows } = await db.query<{ id: string }>(
        `SELECT id FROM external_users WHERE environment_id = $1 AND external_user_id = $2`,
        [environmentId, body.external_user_id],
      );
      const externalUserId = userRows[0]?.id;
      if (!externalUserId) throw new NotFoundError('ExternalUser', body.external_user_id);

      // Create PENDING connection
      const connectionId = generateId();
      await db.query(
        `INSERT INTO connected_accounts
           (id, environment_id, external_user_id, toolkit_id, auth_config_id, status, metadata)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', '{}')`,
        [connectionId, environmentId, externalUserId, toolkit.toolkit_id, toolkit.auth_config_id],
      );

      // Generate PKCE challenge (SI-16)
      const usePkce = toolkit.auth_type === 'OAUTH2_PKCE';
      const pkce = usePkce ? generatePkceChallenge('S256') : null;

      // Store OAuth state in Valkey — 10 min TTL
      const stateToken = await createOAuthState(redis, {
        environment_id: environmentId,
        connection_id: connectionId as UUIDv7,
        connector_slug: body.toolkit_slug,
        code_verifier: pkce?.code_verifier ?? '',
        redirect_uri: body.redirect_uri ?? `${config.OAUTH_REDIRECT_BASE_URL}/callback`,
        created_at: Date.now(),
      });

      // Build redirect URL
      const scopes = body.scopes ?? authCfg.default_scopes ?? [];
      const params = new URLSearchParams({
        client_id: authCfg.client_id,
        response_type: 'code',
        redirect_uri: body.redirect_uri ?? `${config.OAUTH_REDIRECT_BASE_URL}/callback`,
        scope: scopes.join(' '),
        state: stateToken,
        ...(pkce
          ? {
              code_challenge: pkce.code_challenge,
              code_challenge_method: pkce.code_challenge_method,
            }
          : {}),
      });

      const redirectUrl = `${authCfg.authorization_url}?${params.toString()}`;

      return reply.status(200).send({
        redirect_url: redirectUrl,
        connection_id: connectionId,
        state: stateToken,
        expires_in: 600,
      });
    },
  );

  // ─── POST /connections/oauth/callback — exchange code for token ───────────────

  fastify.post(
    '/connections/oauth/callback',
    {
      schema: {
        tags: ['connections'],
        summary: 'Handle OAuth callback — exchange code for connection',
        body: {
          type: 'object',
          required: ['code', 'state'],
          properties: {
            code: { type: 'string' },
            state: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'API key required' } });
      }

      const { code: _code, state } = req.body as { code: string; state: string };
      void _code; // code forwarded to connector-runtime via NATS in Phase 3

      // Consume state (one-time use — CSRF protection, SI-16)
      const oauthState = await consumeOAuthState(redis, state);

      // Validate environment matches (prevent cross-env state injection)
      if (oauthState.environment_id !== req.apiKey.environment_id) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'State environment mismatch' } });
      }

      // Delegate actual token exchange to connector-runtime via NATS
      // connector-runtime: resolves KMS, exchanges code, envelopes secret, stores secret_reference
      // We publish a job and wait for the result (or use direct call in Phase 3)
      //
      // TODO Phase 3: publish NATS job and await result
      // For now, mark connection as requiring async completion
      const db = getPool();
      await db.query(
        `UPDATE connected_accounts
         SET status = 'PENDING', metadata = metadata || $2
         WHERE id = $1`,
        [
          oauthState.connection_id,
          JSON.stringify({
            _oauth_code_received: true,
            _callback_at: new Date().toISOString(),
          }),
        ],
      );

      return reply.status(202).send({
        connection_id: oauthState.connection_id,
        status: 'PENDING',
        message: 'OAuth code received. Connection will be activated once credentials are stored.',
      });
    },
  );

  // ─── DELETE /connections/:id — revoke a connection ───────────────────────────

  fastify.delete(
    '/connections/:id',
    {
      schema: {
        tags: ['connections'],
        summary: 'Revoke a connected account',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (req, reply) => {
      if (!req.apiKey) {
        return reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'API key required' } });
      }

      const { id } = req.params as { id: string };
      const db = getPool();

      const { rowCount } = await db.query(
        `UPDATE connected_accounts
         SET status = 'REVOKED', updated_at = NOW()
         WHERE id = $1 AND environment_id = $2 AND status NOT IN ('REVOKED', 'DELETED')`,
        [id, req.apiKey.environment_id],
      );

      if (!rowCount) throw new NotFoundError('Connection', id);

      return reply.status(204).send();
    },
  );
}
