/**
 * Tool search — FTS + pg_trgm hybrid, with optional connection-status join.
 *
 * Ranking strategy (V1):
 *   - ts_rank_cd on tsvector column (tools.search_vector)
 *   - word_similarity() on tool name for short/typo queries
 *   - Combined: 0.7 * ts_rank + 0.3 * trgm_score
 *   - Falls back to trgm-only when query is too short for FTS (<3 chars)
 *
 * SI-05: description is returned as data, never eval'd or used for routing.
 * SI-13: all params are parameterized — no raw interpolation.
 */

import { getPool } from '@arcane/core';
import type { DbPool } from '@arcane/core';

export interface SearchOptions {
  /** Raw query string from user — untrusted, parameterized */
  q: string;
  /** Filter to a specific toolkit slug */
  toolkit?: string | undefined;
  /** Filter to a category (uppercased internally) */
  category?: string | undefined;
  /** Filter by risk level (e.g. 'READ_ONLY') */
  risk_level?: string | undefined;
  /** Only return tools the session has an active connection for */
  connected_only?: boolean;
  /** session_id — needed when connected_only=true */
  session_id?: string | undefined;
  /** environment_id — scope to a specific env */
  environment_id?: string | undefined;
  /** Max results (1–100) */
  limit?: number;
  /** Opaque cursor (tool_id of last seen row) for keyset pagination */
  cursor?: string | undefined;
  /** Injected pool (for testing) */
  db?: DbPool;
}

export interface SearchRow {
  tool_id: string;
  toolkit_id: string;
  toolkit_slug: string;
  tool_slug: string;
  name: string;
  description: string; // SI-05: untrusted
  risk_level: string[];
  read_only: boolean;
  destructive: boolean;
  is_connected: boolean;
  connection_id: string | null;
  score: number;
}

/**
 * Execute a tool search against Postgres.
 * Returns up to `limit + 1` rows (caller checks hasMore).
 */
export async function searchTools(opts: SearchOptions): Promise<SearchRow[]> {
  const db = opts.db ?? getPool();
  const limit = Math.min(opts.limit ?? 20, 100);
  const q = opts.q.trim();

  const params: unknown[] = [];
  const conditions: string[] = ["t.status = 'ACTIVE'", "tk.status = 'ACTIVE'", "tv.status = 'PUBLISHED'"];

  // ── Scoring expressions ───────────────────────────────────────────────────

  // FTS rank — only meaningful when query has 2+ chars (plainto_tsquery degrades gracefully)
  // Use search_vector column if it exists, else build inline
  const ftsRankExpr = q.length >= 2
    ? `COALESCE(ts_rank_cd(
         COALESCE(t.search_vector,
           to_tsvector('english', t.name || ' ' || t.description || ' ' || tk.name)),
         plainto_tsquery('english', $1)
       ), 0)`
    : '0';

  // Trigram name similarity — catches short queries and typos
  const trgmExpr = `GREATEST(
    word_similarity($1, t.name),
    word_similarity($1, t.name || ' ' || tk.slug)
  )`;

  // Combined score
  const scoreExpr = q.length >= 2
    ? `(0.7 * ${ftsRankExpr} + 0.3 * ${trgmExpr})`
    : trgmExpr;

  params.push(q); // $1 = query
  let idx = 2;

  // ── FTS / trgm filter — at least one must match ───────────────────────────
  if (q.length >= 2) {
    conditions.push(`(
      t.search_vector @@ plainto_tsquery('english', $1)
      OR word_similarity($1, t.name) > 0.15
      OR t.name ILIKE $${idx}
      OR t.description ILIKE $${idx}
    )`);
    params.push(`%${q}%`); // $idx
    idx++;
  } else {
    // Very short query — trigram only
    conditions.push(`word_similarity($1, t.name) > 0.3`);
  }

  // ── Optional filters ──────────────────────────────────────────────────────
  if (opts.toolkit) {
    conditions.push(`tk.slug = $${idx++}`);
    params.push(opts.toolkit);
  }
  if (opts.category) {
    conditions.push(`tk.category = $${idx++}`);
    params.push(opts.category.toUpperCase());
  }
  if (opts.risk_level) {
    conditions.push(`$${idx++} = ANY(tv.risk_level)`);
    params.push(opts.risk_level);
  }
  if (opts.cursor) {
    conditions.push(`t.id > $${idx++}`);
    params.push(opts.cursor);
  }

  // ── Latest PUBLISHED version subquery ─────────────────────────────────────
  const latestVersionJoin = `
    JOIN tool_versions tv ON tv.tool_id = t.id
      AND tv.status = 'PUBLISHED'
      AND tv.version = (
        SELECT MAX(tv2.version)
        FROM tool_versions tv2
        WHERE tv2.tool_id = t.id AND tv2.status = 'PUBLISHED'
      )`;

  // ── Connection status join (optional) ─────────────────────────────────────
  let connectionJoin = '';
  let connectionSelect = 'FALSE AS is_connected, NULL::uuid AS connection_id';

  if (opts.connected_only || opts.session_id) {
    const envClause = opts.environment_id
      ? `AND c.environment_id = $${idx++}`
      : '';
    if (opts.environment_id) params.push(opts.environment_id);

    const sessionClause = opts.session_id
      ? `AND c.session_id = $${idx++}`
      : '';
    if (opts.session_id) params.push(opts.session_id);

    connectionJoin = `
      LEFT JOIN connections c
        ON c.toolkit_id = tk.id
        AND c.status = 'ACTIVE'
        ${envClause}
        ${sessionClause}`;

    connectionSelect = `(c.id IS NOT NULL) AS is_connected, c.id AS connection_id`;

    if (opts.connected_only) {
      conditions.push('c.id IS NOT NULL');
    }
  }

  // ── Limit ─────────────────────────────────────────────────────────────────
  params.push(limit + 1); // fetch +1 for hasMore detection
  const limitIdx = idx++;

  const sql = `
    SELECT
      t.id          AS tool_id,
      tk.id         AS toolkit_id,
      tk.slug       AS toolkit_slug,
      t.slug        AS tool_slug,
      t.name,
      t.description,
      tv.risk_level,
      tv.read_only,
      tv.destructive,
      ${connectionSelect},
      ${scoreExpr} AS score
    FROM tools t
    JOIN toolkits tk ON tk.id = t.toolkit_id
    ${latestVersionJoin}
    ${connectionJoin}
    WHERE ${conditions.join('\n      AND ')}
    ORDER BY score DESC, t.id ASC
    LIMIT $${limitIdx}
  `;

  const { rows } = await db.query<SearchRow>(sql, params);
  return rows;
}
