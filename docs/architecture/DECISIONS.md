# Architecture Decision Records

## ADR-001: PostgreSQL as the single authoritative store

**Status:** Accepted

**Context:** We need one authoritative state store. Options were PostgreSQL, DynamoDB, MongoDB, or CockroachDB.

**Decision:** PostgreSQL 16 with pgvector, pg_trgm, and FTS.

**Rationale:**
- Single source of truth avoids dual-write bugs
- pgvector eliminates a separate vector DB in V1
- pg_trgm + tsvector gives us fuzzy search without Elasticsearch
- Mature ACID guarantees for financial/audit records
- Heroku Postgres, Neon, Supabase, RDS all supported — no vendor lock-in

**Consequences:** NATS is NOT authoritative. Valkey is NOT authoritative. If either is lost, we can reconstruct from Postgres. Postgres is NEVER the queue — NATS JetStream handles all async work.

---

## ADR-002: NATS JetStream for all async messaging

**Status:** Accepted

**Context:** We need durable, at-least-once delivery for execution jobs, trigger events, and webhook deliveries.

**Decision:** NATS JetStream.

**Rationale:**
- Lower operational overhead than Kafka for V1 scale
- Built-in KV and object store (used for ephemeral distributed config)
- Consumer groups and pull consumers suit our worker model
- Postgres-as-queue anti-pattern explicitly rejected

**Consequences:** Each worker subscribes to named JetStream consumers. Dead-lettered messages go to a DLQ stream. Postgres `events` and `deliveries` tables are audit records written AFTER successful NATS publish, not before.

---

## ADR-003: Envelope encryption for all credentials

**Status:** Accepted

**Context:** Connected account credentials (OAuth tokens, API keys) must be stored securely.

**Decision:** Envelope encryption. A Data Encryption Key (DEK) encrypts the credential. The DEK is encrypted by a Key Encryption Key (KEK) held in the configured KMS backend. Postgres stores only an opaque `secret_reference` string — never plaintext or even the DEK.

**Rationale:**
- Secrets in Postgres would be compromised in a DB breach
- Cloud KMS (AWS KMS / GCP KMS) for SaaS; OpenBao (HashiCorp Vault OSS fork) for self-hosted
- `local` backend (AES-256-GCM with env key) for development
- Key rotation: new DEK, re-encrypt, update reference — zero downtime

**Consequences:** The connector-runtime is the ONLY component that ever calls KMS to decrypt. API service, MCP gateway, dashboard — none of them ever see plaintext credentials.

---

## ADR-004: UUIDv7 for all primary keys

**Status:** Accepted

**Context:** UUID v4 causes B-tree fragmentation at scale. Sequential integers leak record counts.

**Decision:** UUIDv7 — time-ordered, k-sortable, globally unique.

**Rationale:**
- Time-ordered: new records append to the end of B-tree pages, reducing write amplification
- Globally unique: safe for distributed ID generation without coordination
- Contains embedded timestamp: can extract creation time from ID without joining
- 128-bit: safe against enumeration attacks (unlike sequential int IDs)

**Consequences:** All `id` columns are `UUID` (Postgres stores UUIDv7 as standard UUID). Cursor pagination uses `id > cursor` which is naturally time-ordered.

---

## ADR-005: Tool versions are immutable after PUBLISH

**Status:** Accepted (Security Invariant #6)

**Context:** Agent code pins tool versions. If tool behavior changes under a pinned version, agents break or — worse — behave unexpectedly.

**Decision:** Once a `ToolVersion` is PUBLISHED, its schema, parameters, risk_level, and HTTP configuration are immutable. Changes require a new version.

**Rationale:**
- Reproducible agent behavior
- Audit trail: execution records reference an immutable tool version
- Policy rules reference tool versions — immutability means policies don't silently change

**Consequences:** Connector authors must increment versions for any behavioral change. The connector-runtime validates the tool version exists and is PUBLISHED before execution.
