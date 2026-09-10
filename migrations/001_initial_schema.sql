-- Migration: 001_initial_schema
-- Arcane Platform — Canonical Database Schema
-- Per architecture section 10-11
-- RULES:
--   - All IDs: UUIDv7 (uuid type in Postgres)
--   - All timestamps: TIMESTAMPTZ stored as UTC
--   - No auto-increment integer IDs exposed via public API
--   - Soft deletes via status fields, not hard deletes
--   - Append-only tables: execution_attempts, audit_events, usage_records

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Extensions (also in 001-init.sql but idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ─────────────────────────────────────────────────────────────────────────────
-- Organizations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations (slug);
CREATE INDEX idx_organizations_status ON organizations (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Projects
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE projects (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX idx_projects_org_slug ON projects (organization_id, slug);
CREATE INDEX idx_projects_organization_id ON projects (organization_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Environments
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE environments (
  id          UUID PRIMARY KEY,
  project_id  UUID NOT NULL REFERENCES projects(id),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'CUSTOM')),
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, slug)
);

CREATE INDEX idx_environments_project_slug ON environments (project_id, slug);
CREATE INDEX idx_environments_project_id ON environments (project_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Platform Users (dashboard/management users — NOT external app users)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id          UUID PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  password_hash TEXT, -- nullable for future SSO/OIDC
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);

-- ─────────────────────────────────────────────────────────────────────────────
-- Organization Members
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  role            TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_org_members_org_user ON organization_members (organization_id, user_id);
CREATE INDEX idx_org_members_user ON organization_members (user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- External Users (end-users of integrating application — NOT platform users)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE external_users (
  id               UUID PRIMARY KEY,
  environment_id   UUID NOT NULL REFERENCES environments(id),
  external_user_id TEXT NOT NULL,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (environment_id, external_user_id)
);

CREATE INDEX idx_external_users_env_id ON external_users (environment_id, external_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- API Keys (write-only: hash stored, plaintext never retrievable)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE api_keys (
  id             UUID PRIMARY KEY,
  environment_id UUID NOT NULL REFERENCES environments(id),
  name           TEXT NOT NULL,
  key_prefix     TEXT NOT NULL,     -- e.g. "arc_live_abc123" — safe to display
  key_hash       TEXT NOT NULL,     -- argon2/bcrypt hash — NEVER expose this
  permissions    JSONB NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at   TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ
);

CREATE INDEX idx_api_keys_environment_id ON api_keys (environment_id);
CREATE INDEX idx_api_keys_prefix ON api_keys (key_prefix); -- Fast prefix lookup for auth

-- ─────────────────────────────────────────────────────────────────────────────
-- Toolkits
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE toolkits (
  id          UUID PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  category    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEPRECATED', 'DISABLED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FTS index on toolkit description for search
CREATE INDEX idx_toolkits_fts ON toolkits USING GIN (to_tsvector('english', name || ' ' || description));
CREATE INDEX idx_toolkits_slug ON toolkits (slug);

-- ─────────────────────────────────────────────────────────────────────────────
-- Toolkit Versions (IMMUTABLE once PUBLISHED)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE toolkit_versions (
  id           UUID PRIMARY KEY,
  toolkit_id   UUID NOT NULL REFERENCES toolkits(id),
  version      TEXT NOT NULL,
  manifest     JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'DEPRECATED', 'RETIRED')),
  published_at TIMESTAMPTZ,
  deprecated_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (toolkit_id, version)
);

CREATE INDEX idx_toolkit_versions_toolkit ON toolkit_versions (toolkit_id, version);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tools
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE tools (
  id          UUID PRIMARY KEY,
  toolkit_id  UUID NOT NULL REFERENCES toolkits(id),
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL, -- Treated as untrusted data — see arch section 30
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DEPRECATED', 'RETIRED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (toolkit_id, slug)
);

-- FTS + trigram index for tool search (section 26)
CREATE INDEX idx_tools_fts ON tools USING GIN (to_tsvector('english', name || ' ' || description));
CREATE INDEX idx_tools_name_trgm ON tools USING GIN (name gin_trgm_ops);
CREATE INDEX idx_tools_description_trgm ON tools USING GIN (description gin_trgm_ops);
CREATE INDEX idx_tools_toolkit_id ON tools (toolkit_id);
CREATE INDEX idx_tools_slug ON tools (toolkit_id, slug);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tool Versions (IMMUTABLE once PUBLISHED)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE tool_versions (
  id                   UUID PRIMARY KEY,
  tool_id              UUID NOT NULL REFERENCES tools(id),
  toolkit_version_id   UUID NOT NULL REFERENCES toolkit_versions(id),
  version              INTEGER NOT NULL CHECK (version > 0),
  input_schema         JSONB NOT NULL,
  output_schema        JSONB NOT NULL,
  execution_definition JSONB NOT NULL,
  risk_level           JSONB NOT NULL DEFAULT '[]',  -- Array of risk labels
  read_only            BOOLEAN NOT NULL DEFAULT FALSE,
  destructive          BOOLEAN NOT NULL DEFAULT FALSE,
  idempotent           BOOLEAN NOT NULL DEFAULT FALSE,
  status               TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'DEPRECATED', 'RETIRED')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at         TIMESTAMPTZ,
  deprecated_at        TIMESTAMPTZ,
  UNIQUE (tool_id, version)
);

CREATE INDEX idx_tool_versions_tool ON tool_versions (tool_id, version);
CREATE INDEX idx_tool_versions_status ON tool_versions (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Auth Configs (OAuth endpoints, scopes — NO live secrets ever stored here)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE auth_configs (
  id                   UUID PRIMARY KEY,
  toolkit_id           UUID NOT NULL REFERENCES toolkits(id),
  name                 TEXT NOT NULL,
  auth_type            TEXT NOT NULL CHECK (auth_type IN ('OAUTH2', 'OAUTH2_PKCE', 'API_KEY', 'BASIC', 'CUSTOM')),
  configuration_schema JSONB NOT NULL,
  authorization_config JSONB NOT NULL, -- OAuth endpoints, scopes etc — NO secrets
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_configs_toolkit ON auth_configs (toolkit_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Connected Accounts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE connected_accounts (
  id                  UUID PRIMARY KEY,
  environment_id      UUID NOT NULL REFERENCES environments(id),
  external_user_id    UUID NOT NULL REFERENCES external_users(id),
  toolkit_id          UUID NOT NULL REFERENCES toolkits(id),
  auth_config_id      UUID NOT NULL REFERENCES auth_configs(id),
  status              TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','EXPIRED','REAUTH_REQUIRED','REVOKED','ERROR')),
  secret_reference    TEXT,       -- Opaque ref into KMS/secret store — NEVER the secret
  provider_account_id TEXT,       -- Provider's own account ID (safe to store)
  metadata            JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ,
  last_used_at        TIMESTAMPTZ
);

CREATE INDEX idx_connections_env_user ON connected_accounts (environment_id, external_user_id);
CREATE INDEX idx_connections_env_toolkit ON connected_accounts (environment_id, toolkit_id);
CREATE INDEX idx_connections_status ON connected_accounts (status);
CREATE INDEX idx_connections_expires ON connected_accounts (expires_at) WHERE expires_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Sessions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id               UUID PRIMARY KEY,
  environment_id   UUID NOT NULL REFERENCES environments(id),
  external_user_id UUID NOT NULL REFERENCES external_users(id),
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  expires_at       TIMESTAMPTZ NOT NULL,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Sessions NEVER store secrets or credentials
);

CREATE INDEX idx_sessions_env_user ON sessions (environment_id, external_user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
CREATE INDEX idx_sessions_status ON sessions (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Session Tools (selected tools + connections for a session)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE session_tools (
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  tool_id       UUID NOT NULL REFERENCES tools(id),
  connection_id UUID NOT NULL REFERENCES connected_accounts(id),
  PRIMARY KEY (session_id, tool_id)
);

CREATE INDEX idx_session_tools_session ON session_tools (session_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Policies
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE policies (
  id             UUID PRIMARY KEY,
  environment_id UUID NOT NULL REFERENCES environments(id),
  name           TEXT NOT NULL,
  description    TEXT,
  version        INTEGER NOT NULL DEFAULT 1,
  status         TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'DISABLED')),
  rules          JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policies_environment ON policies (environment_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- Executions (append-mostly — status transitions only)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE executions (
  id              UUID PRIMARY KEY,
  environment_id  UUID NOT NULL REFERENCES environments(id),
  session_id      UUID NOT NULL REFERENCES sessions(id),
  external_user_id UUID NOT NULL REFERENCES external_users(id),
  tool_id         UUID NOT NULL REFERENCES tools(id),
  tool_version_id UUID NOT NULL REFERENCES tool_versions(id),
  connection_id   UUID NOT NULL REFERENCES connected_accounts(id),
  status          TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','AUTHORIZING','RESOLVING','EXECUTING','SUCCEEDED','RETRYING','FAILED','CANCELLED','TIMED_OUT')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  latency_ms      INTEGER CHECK (latency_ms >= 0),
  request_id      TEXT NOT NULL,
  trace_id        TEXT NOT NULL,
  error_code      TEXT,
  error_message   TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO secrets, NO provider credentials, NO raw API keys ever in this table
);

CREATE INDEX idx_executions_env_created ON executions (environment_id, created_at DESC);
CREATE INDEX idx_executions_session ON executions (session_id, created_at DESC);
CREATE INDEX idx_executions_user ON executions (external_user_id, created_at DESC);
CREATE INDEX idx_executions_tool ON executions (tool_id, created_at DESC);
CREATE INDEX idx_executions_status ON executions (status, created_at DESC);
CREATE INDEX idx_executions_request_id ON executions (request_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Execution Attempts (IMMUTABLE — retries create new rows, never overwrite)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE execution_attempts (
  id             UUID PRIMARY KEY,
  execution_id   UUID NOT NULL REFERENCES executions(id),
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  status         TEXT NOT NULL CHECK (status IN ('PENDING','EXECUTING','SUCCEEDED','FAILED','TIMED_OUT')),
  http_status    INTEGER,
  error_code     TEXT,
  latency_ms     INTEGER CHECK (latency_ms >= 0),
  metadata       JSONB,
  UNIQUE (execution_id, attempt_number)
);

CREATE INDEX idx_attempts_execution ON execution_attempts (execution_id, attempt_number);

-- ─────────────────────────────────────────────────────────────────────────────
-- Audit Events (APPEND-ONLY — no updates, no deletes)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE audit_events (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  project_id      UUID NOT NULL REFERENCES projects(id),
  environment_id  UUID NOT NULL REFERENCES environments(id),
  actor_type      TEXT NOT NULL CHECK (actor_type IN ('USER','API_KEY','SYSTEM','EXTERNAL_USER')),
  actor_id        TEXT NOT NULL,
  action          TEXT NOT NULL,   -- e.g. "execution.created", "connection.revoked"
  resource_type   TEXT NOT NULL,
  resource_id     TEXT NOT NULL,
  request_id      TEXT NOT NULL,
  ip_address      TEXT,
  user_agent      TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- APPEND-ONLY: no update/delete triggers or permissions allowed
);

CREATE INDEX idx_audit_org_created ON audit_events (organization_id, created_at DESC);
CREATE INDEX idx_audit_env_action ON audit_events (environment_id, action, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_events (actor_type, actor_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_events (resource_type, resource_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE triggers (
  id             UUID PRIMARY KEY,
  environment_id UUID NOT NULL REFERENCES environments(id),
  toolkit_id     UUID NOT NULL REFERENCES toolkits(id),
  name           TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'DELETED')),
  configuration  JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_triggers_env ON triggers (environment_id, status);
CREATE INDEX idx_triggers_toolkit ON triggers (toolkit_id, event_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger Subscriptions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE trigger_subscriptions (
  id               UUID PRIMARY KEY,
  trigger_id       UUID NOT NULL REFERENCES triggers(id),
  external_user_id UUID NOT NULL REFERENCES external_users(id),
  destination_id   UUID NOT NULL, -- FK to webhook_destinations added below
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'DELETED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trigger_subs_trigger ON trigger_subscriptions (trigger_id, status);
CREATE INDEX idx_trigger_subs_user ON trigger_subscriptions (external_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Webhook Destinations
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE webhook_destinations (
  id               UUID PRIMARY KEY,
  environment_id   UUID NOT NULL REFERENCES environments(id),
  url              TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'DELETED')),
  secret_reference TEXT, -- For signing outbound deliveries — opaque ref
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_dest_env ON webhook_destinations (environment_id, status);

-- Add FK now that destination table exists
ALTER TABLE trigger_subscriptions
  ADD CONSTRAINT fk_trigger_subs_destination
  FOREIGN KEY (destination_id) REFERENCES webhook_destinations(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Events (inbound from providers — payload stored by reference)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE events (
  id                UUID PRIMARY KEY,
  environment_id    UUID NOT NULL REFERENCES environments(id),
  provider_event_id TEXT,                              -- For deduplication
  trigger_id        UUID NOT NULL REFERENCES triggers(id),
  connection_id     UUID NOT NULL REFERENCES connected_accounts(id),
  received_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  attempt_count     INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','PROCESSING','DELIVERED','FAILED','DEAD_LETTERED')),
  payload_hash      TEXT NOT NULL,                     -- SHA-256 of payload for dedup
  payload_reference TEXT,                              -- Object store ref for large payloads
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_env_created ON events (environment_id, created_at DESC);
CREATE INDEX idx_events_trigger ON events (trigger_id, created_at DESC);
CREATE INDEX idx_events_status ON events (status, created_at DESC);
-- Deduplication index
CREATE UNIQUE INDEX idx_events_dedup ON events (trigger_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Deliveries (outbound to customer endpoints — per-attempt)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE deliveries (
  id             UUID PRIMARY KEY,
  event_id       UUID NOT NULL REFERENCES events(id),
  destination_id UUID NOT NULL REFERENCES webhook_destinations(id),
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DELIVERING','SUCCEEDED','FAILED','DEAD_LETTERED')),
  http_status    INTEGER,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  next_retry_at  TIMESTAMPTZ,
  error_code     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deliveries_event ON deliveries (event_id, attempt_number);
CREATE INDEX idx_deliveries_retry ON deliveries (status, next_retry_at) WHERE next_retry_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Usage Records (append-only billing/metering)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE usage_records (
  id              UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  environment_id  UUID NOT NULL REFERENCES environments(id),
  metric          TEXT NOT NULL CHECK (metric IN ('EXECUTION', 'TOKEN', 'WEBHOOK_DELIVERY')),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  execution_id    UUID REFERENCES executions(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_org_created ON usage_records (organization_id, created_at DESC);
CREATE INDEX idx_usage_env_metric ON usage_records (environment_id, metric, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Updated_at auto-update function
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all mutable tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations', 'projects', 'environments', 'users',
    'organization_members', 'external_users', 'toolkits', 'auth_configs',
    'connected_accounts', 'sessions', 'policies', 'triggers',
    'trigger_subscriptions', 'webhook_destinations'
  ]
  LOOP
    EXECUTE format('
      CREATE TRIGGER trg_%I_updated_at
      BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      t, t
    );
  END LOOP;
END;
$$;

COMMIT;
