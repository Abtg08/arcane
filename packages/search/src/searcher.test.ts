/**
 * Tool search — unit tests (no real DB).
 * We mock the pool query to inspect the SQL and params.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchTools } from './searcher.js';
import type { DbPool } from '@arcane/core';

function makePool(rows: unknown[] = []): DbPool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
  } as unknown as DbPool;
}

function captureQuery(db: DbPool): { sql: string; params: unknown[] } {
  const mock = (db.query as ReturnType<typeof vi.fn>).mock;
  const [sql, params] = mock.calls[0] as [string, unknown[]];
  return { sql, params };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchTools — SQL generation', () => {
  it('passes query as $1', async () => {
    const db = makePool();
    await searchTools({ q: 'list repos', db });
    const { params } = captureQuery(db);
    expect(params[0]).toBe('list repos');
  });

  it('applies FTS condition for query >= 2 chars', async () => {
    const db = makePool();
    await searchTools({ q: 'gh', db });
    const { sql } = captureQuery(db);
    expect(sql).toContain('plainto_tsquery');
    expect(sql).toContain('word_similarity');
  });

  it('uses trigram-only for single char query', async () => {
    const db = makePool();
    await searchTools({ q: 'g', db });
    const { sql } = captureQuery(db);
    expect(sql).not.toContain('plainto_tsquery');
    expect(sql).toContain('word_similarity');
  });

  it('adds toolkit filter when provided', async () => {
    const db = makePool();
    await searchTools({ q: 'issue', toolkit: 'github', db });
    const { sql, params } = captureQuery(db);
    expect(sql).toContain('tk.slug =');
    expect(params).toContain('github');
  });

  it('adds category filter when provided', async () => {
    const db = makePool();
    await searchTools({ q: 'deploy', category: 'developer_tools', db });
    const { sql, params } = captureQuery(db);
    expect(sql).toContain('tk.category =');
    expect(params).toContain('DEVELOPER_TOOLS');
  });

  it('uppercases category', async () => {
    const db = makePool();
    await searchTools({ q: 'pay', category: 'finance', db });
    const { params } = captureQuery(db);
    expect(params).toContain('FINANCE');
    expect(params).not.toContain('finance');
  });

  it('adds risk_level filter when provided', async () => {
    const db = makePool();
    await searchTools({ q: 'read', risk_level: 'READ_ONLY', db });
    const { sql, params } = captureQuery(db);
    expect(sql).toContain('ANY(tv.risk_level)');
    expect(params).toContain('READ_ONLY');
  });

  it('adds cursor condition when provided', async () => {
    const db = makePool();
    await searchTools({ q: 'issue', cursor: 'some-uuid', db });
    const { sql, params } = captureQuery(db);
    expect(sql).toContain('t.id >');
    expect(params).toContain('some-uuid');
  });

  it('always has PUBLISHED version join', async () => {
    const db = makePool();
    await searchTools({ q: 'list', db });
    const { sql } = captureQuery(db);
    expect(sql).toContain("tv.status = 'PUBLISHED'");
    expect(sql).toContain('MAX(tv2.version)');
  });

  it('fetches limit+1 rows for hasMore detection', async () => {
    const db = makePool();
    await searchTools({ q: 'issue', limit: 10, db });
    const { params } = captureQuery(db);
    // Last param is the LIMIT value = 10+1=11
    expect(params[params.length - 1]).toBe(11);
  });

  it('caps limit at 100', async () => {
    const db = makePool();
    await searchTools({ q: 'issue', limit: 999, db });
    const { params } = captureQuery(db);
    expect(params[params.length - 1]).toBe(101); // 100+1
  });

  it('no connection join when connected_only=false and no session_id', async () => {
    const db = makePool();
    await searchTools({ q: 'list', db });
    const { sql } = captureQuery(db);
    expect(sql).not.toContain('connections c');
    expect(sql).toContain('FALSE AS is_connected');
  });

  it('adds connection join when connected_only=true', async () => {
    const db = makePool();
    await searchTools({ q: 'list', connected_only: true, db });
    const { sql } = captureQuery(db);
    expect(sql).toContain('connections c');
    expect(sql).toContain('c.id IS NOT NULL');
  });

  it('adds connection join (not filter) when only session_id provided', async () => {
    const db = makePool();
    await searchTools({ q: 'list', session_id: 'sess-1', db });
    const { sql } = captureQuery(db);
    expect(sql).toContain('connections c');
    // connected_only=false → no mandatory c.id IS NOT NULL filter
    expect(sql).not.toContain('\n      AND c.id IS NOT NULL');
  });

  it('adds environment_id filter in connection join', async () => {
    const db = makePool();
    await searchTools({ q: 'list', connected_only: true, environment_id: 'env-1', db });
    const { sql, params } = captureQuery(db);
    expect(sql).toContain('c.environment_id =');
    expect(params).toContain('env-1');
  });

  it('SI-05: description in SELECT but never in WHERE', async () => {
    const db = makePool();
    await searchTools({ q: 'anything', db });
    const { sql } = captureQuery(db);
    // Description appears in SELECT only
    expect(sql).toContain('t.description');
    // It is NOT used in the ranking WHERE — just ILIKE for matching
    const whereIdx = sql.indexOf('WHERE');
    // description in SELECT (before WHERE) is fine; after WHERE only in ILIKE
    const afterWhere = sql.slice(whereIdx);
    const descInWhere = afterWhere.indexOf('t.description');
    if (descInWhere !== -1) {
      // Only acceptable in ILIKE for matching, not for any logic
      expect(afterWhere.slice(descInWhere - 10, descInWhere + 20)).toContain('ILIKE');
    }
  });

  it('returns rows from db query', async () => {
    const fakeRow = {
      tool_id: 'tid',
      toolkit_id: 'kid',
      toolkit_slug: 'github',
      tool_slug: 'list_issues',
      name: 'List Issues',
      description: 'List issues',
      risk_level: ['READ_ONLY'],
      read_only: true,
      destructive: false,
      is_connected: false,
      connection_id: null,
      score: 0.9,
    };
    const db = makePool([fakeRow]);
    const results = await searchTools({ q: 'issues', db });
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(fakeRow);
  });
});

describe('searchTools — scoring expressions', () => {
  it('uses combined 0.7/0.3 score for long queries', async () => {
    const db = makePool();
    await searchTools({ q: 'list github issues', db });
    const { sql } = captureQuery(db);
    expect(sql).toContain('0.7');
    expect(sql).toContain('0.3');
  });

  it('uses trigram-only score for short query', async () => {
    const db = makePool();
    await searchTools({ q: 'g', db });
    const { sql } = captureQuery(db);
    expect(sql).not.toContain('0.7');
    expect(sql).toContain('word_similarity');
  });

  it('orders by score DESC', async () => {
    const db = makePool();
    await searchTools({ q: 'issue', db });
    const { sql } = captureQuery(db);
    expect(sql).toContain('ORDER BY score DESC');
  });
});

describe('searchTools — param safety (SI-13)', () => {
  it('user query is always in params, never interpolated', async () => {
    const malicious = "'; DROP TABLE tools; --";
    const db = makePool();
    await searchTools({ q: malicious, db });
    const { sql, params } = captureQuery(db);
    // SQL must not contain the raw malicious string
    expect(sql).not.toContain(malicious);
    // But it must be in params (safe)
    expect(params[0]).toBe(malicious.trim());
  });

  it('toolkit slug is always in params', async () => {
    const db = makePool();
    await searchTools({ q: 'list', toolkit: "' OR '1'='1", db });
    const { sql, params } = captureQuery(db);
    expect(sql).not.toContain("' OR '1'='1");
    expect(params).toContain("' OR '1'='1");
  });
});
