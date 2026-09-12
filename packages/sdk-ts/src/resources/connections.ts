/**
 * Connections resource — manage user connections to external services.
 */

import type { HttpClient } from '../http.js';
import type { PageResult, Connection } from '../types.js';

export interface ListConnectionsOptions {
  external_user_id?: string;
  toolkit_id?: string;
  status?: 'ACTIVE' | 'PENDING' | 'REVOKED' | 'ERROR';
  cursor?: string;
  limit?: number;
}

export interface InitiateOAuthOptions {
  toolkit_slug: string;
  external_user_id: string;
  redirect_uri: string;
  scopes?: string[];
}

export interface OAuthInitiateResult {
  redirect_url: string;
  state: string;
}

export class ConnectionsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List connections, optionally filtered by user, toolkit, or status.
   */
  list(opts: ListConnectionsOptions = {}): Promise<PageResult<Connection>> {
    return this.http.get('/connections', {
      external_user_id: opts.external_user_id,
      toolkit_id: opts.toolkit_id,
      status: opts.status,
      cursor: opts.cursor,
      limit: opts.limit,
    });
  }

  /**
   * Get a specific connection by ID.
   */
  get(connectionId: string): Promise<Connection> {
    return this.http.get(`/connections/${connectionId}`);
  }

  /**
   * Initiate an OAuth flow. Returns the redirect URL to send the user to.
   */
  initiateOAuth(opts: InitiateOAuthOptions): Promise<OAuthInitiateResult> {
    return this.http.post('/connections/oauth/initiate', opts);
  }

  /**
   * Revoke a connection.
   */
  revoke(connectionId: string): Promise<void> {
    return this.http.del(`/connections/${connectionId}`);
  }
}
