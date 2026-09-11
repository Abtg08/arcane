/**
 * @arcane/search — Tool discovery: FTS + pg_trgm + relevance scoring.
 *
 * V1: PostgreSQL tsvector + trigram similarity. No LLM in search path.
 * V2 (future): pgvector semantic re-rank on top.
 *
 * SI-05: description is untrusted data — never eval'd or used for routing.
 */

export { searchTools } from './searcher.js';
export type { SearchOptions, SearchRow } from './searcher.js';
