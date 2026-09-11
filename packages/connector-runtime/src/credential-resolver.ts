/**
 * Credential resolver — SI-02.
 *
 * The ONLY place in the system that calls SecretManager.unseal().
 * Loads a connected_account's secret_reference from the DB and
 * decrypts it to a live credential object.
 *
 * NEVER returns credentials to the API or MCP layers.
 * NEVER logs credential values — only IDs and redacted shapes.
 *
 * Credential shapes by auth type:
 *   OAUTH2 / OAUTH2_PKCE  → { access_token, refresh_token?, expires_at? }
 *   API_KEY               → { api_key }
 *   BASIC                 → { username, password }
 *   CUSTOM                → opaque Record<string, string>
 */

import type { DbPool } from '@arcane/core';
import { SecretManager } from '@arcane/core';
import { InternalError, NotFoundError } from '@arcane/core';

// ── Credential shapes ─────────────────────────────────────────────────────────

export interface OAuth2Credential {
  type: 'oauth2';
  access_token: string;
  refresh_token?: string | undefined;
  expires_at?: string | undefined; // ISO 8601
  token_type?: string | undefined;
  scope?: string | undefined;
}

export interface ApiKeyCredential {
  type: 'api_key';
  api_key: string;
  header_name?: string | undefined; // Default: 'Authorization', value: 'Bearer <key>'
}

export interface BasicCredential {
  type: 'basic';
  username: string;
  password: string;
}

export interface CustomCredential {
  type: 'custom';
  fields: Record<string, string>;
}

export type ResolvedCredential =
  | OAuth2Credential
  | ApiKeyCredential
  | BasicCredential
  | CustomCredential;

// ── Resolver ──────────────────────────────────────────────────────────────────

export class CredentialResolver {
  constructor(
    private readonly db: DbPool,
    private readonly secretManager: SecretManager,
  ) {}

  /**
   * Resolve credentials for a connected account.
   *
   * SI-02: Only this class may call secretManager.unseal().
   * SI-13: Parameterized queries only — no SQL interpolation.
   *
   * @param connectionId — UUID of the connected_account
   * @param environmentId — scoping to prevent cross-environment access
   * @returns Decrypted credential, ready for HTTP use
   */
  async resolve(
    connectionId: string,
    environmentId: string,
  ): Promise<ResolvedCredential> {
    // Load the connected account — includes secret_reference (still encrypted)
    const { rows } = await this.db.query<{
      id: string;
      status: string;
      secret_reference: string | null;
      auth_type: string;
    }>(
      `SELECT ca.id, ca.status, ca.secret_reference, ac.auth_type
       FROM connected_accounts ca
       JOIN auth_configs ac ON ac.id = ca.auth_config_id
       WHERE ca.id = $1 AND ca.environment_id = $2`,
      [connectionId, environmentId],
    );

    const account = rows[0];
    if (!account) {
      throw new NotFoundError('ConnectedAccount', connectionId);
    }

    if (account.status !== 'ACTIVE') {
      throw new InternalError(
        `Connection ${connectionId} is ${account.status} — cannot resolve credentials`,
      );
    }

    if (!account.secret_reference) {
      throw new InternalError(
        `Connection ${connectionId} has no secret_reference — OAuth flow incomplete`,
      );
    }

    // Decrypt — the ONLY unseal() call in the system (SI-02)
    let plaintext: string;
    try {
      plaintext = await this.secretManager.unseal(account.secret_reference);
    } catch (err) {
      throw new InternalError(
        `Credential decryption failed for connection ${connectionId}`,
        err,
      );
    }

    // Parse the decrypted credential JSON
    let raw: unknown;
    try {
      raw = JSON.parse(plaintext);
    } catch {
      throw new InternalError(
        `Invalid credential format for connection ${connectionId}`,
      );
    }

    return this.shape(raw, account.auth_type, connectionId);
  }

  /** Shape raw JSON into a typed credential. Never logs or re-throws values. */
  private shape(
    raw: unknown,
    authType: string,
    connectionId: string,
  ): ResolvedCredential {
    if (typeof raw !== 'object' || raw === null) {
      throw new InternalError(`Credential for ${connectionId} is not an object`);
    }

    const obj = raw as Record<string, unknown>;

    switch (authType) {
      case 'OAUTH2':
      case 'OAUTH2_PKCE':
        if (typeof obj['access_token'] !== 'string') {
          throw new InternalError(`Missing access_token in OAuth2 credential for ${connectionId}`);
        }
        return {
          type: 'oauth2' as const,
          access_token: obj['access_token'],
          ...(typeof obj['refresh_token'] === 'string' ? { refresh_token: obj['refresh_token'] } : {}),
          ...(typeof obj['expires_at'] === 'string' ? { expires_at: obj['expires_at'] } : {}),
          ...(typeof obj['token_type'] === 'string' ? { token_type: obj['token_type'] } : {}),
          ...(typeof obj['scope'] === 'string' ? { scope: obj['scope'] } : {}),
        };

      case 'API_KEY':
        if (typeof obj['api_key'] !== 'string') {
          throw new InternalError(`Missing api_key in API_KEY credential for ${connectionId}`);
        }
        return {
          type: 'api_key' as const,
          api_key: obj['api_key'],
          ...(typeof obj['header_name'] === 'string' ? { header_name: obj['header_name'] } : {}),
        };

      case 'BASIC':
        if (typeof obj['username'] !== 'string' || typeof obj['password'] !== 'string') {
          throw new InternalError(`Missing username/password in BASIC credential for ${connectionId}`);
        }
        return {
          type: 'basic',
          username: obj['username'],
          password: obj['password'],
        };

      case 'CUSTOM':
        return {
          type: 'custom',
          fields: Object.fromEntries(
            Object.entries(obj).filter(([, v]) => typeof v === 'string') as [string, string][],
          ),
        };

      default:
        throw new InternalError(`Unknown auth_type '${authType}' for connection ${connectionId}`);
    }
  }
}
