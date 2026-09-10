# Arcane Security Invariants

These invariants are NON-NEGOTIABLE. Any code change that violates one is a blocker.
PRs are reviewed against this list. New invariants are added here, never removed.

## Credential Safety

**SI-01** Secrets never in LLM context.
The tool invocation payload sent to or from any LLM never contains credentials, tokens, or keys.
Only `secret_reference` (an opaque KMS pointer) is stored in Postgres.

**SI-02** Connector-runtime is the only credential resolver.
No other service, package, or layer decrypts credentials. The API, MCP gateway, search,
policy, and auth packages never call KMS.

**SI-03** `connected_accounts.secret_reference` is opaque.
It is a pointer into the KMS, not the secret itself. It must never be logged, returned in API
responses, or passed to LLM context.

## Execution Safety

**SI-04** Every execution is policy-checked before credential resolution.
Policy evaluation happens BEFORE the credential-resolve step. A DENY from policy means
credentials are never loaded.

**SI-05** Tool metadata is untrusted data, not instructions.
Tool `name`, `description`, and connector `manifest` are user-supplied strings.
They are rendered in the UI and passed to LLMs as data. They are NEVER eval'd, exec'd,
or interpreted as system instructions.

**SI-06** Published tool versions are immutable.
`tool_versions` rows with `status = 'PUBLISHED'` are never updated. Schema changes require
a new version. Enforcement: no UPDATE trigger allowed on published rows.

**SI-07** Provider responses are untrusted data.
HTTP responses from external providers (GitHub, Slack, etc.) are validated against the tool's
response schema and sanitized before being stored or returned. They are never passed directly
to LLM system context.

## Network Safety

**SI-08** SSRF protection is mandatory.
The connector-runtime validates all outbound URLs against an allowlist before making requests.
Private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1, link-local) are blocked.
Metadata endpoints (169.254.169.254, etc.) are explicitly blocked.

**SI-09** MCP/SDK cannot bypass policy.
The MCP gateway and TypeScript SDK are thin protocol adapters. They delegate execution to
the API's Execution Gateway. They have no DB connection and no KMS access.

## Audit Safety

**SI-10** `audit_events` is append-only.
No UPDATE or DELETE statements are permitted on `audit_events`. The Postgres role
used at runtime (`arcane_app`) does not have UPDATE/DELETE grants on this table.

**SI-11** All executions are logged before and after.
An `audit_event` is written when execution starts (AUTHORIZING) and when it reaches any
terminal state (SUCCEEDED, FAILED, CANCELLED, TIMED_OUT).

## Data Safety

**SI-12** `TIMESTAMPTZ` everywhere, UTC always.
No `TIMESTAMP WITHOUT TIME ZONE`. All datetimes include timezone offset (UTC).
The DB connection is opened with `TimeZone=UTC`.

**SI-13** No raw SQL concatenation.
All queries use parameterized statements (`$1`, `$2`, ...). String interpolation into SQL is
a build error (enforced by custom ESLint rule).

**SI-14** Valkey is never authoritative.
Rate limits, OAuth state, session caches, and distributed locks live in Valkey.
If Valkey is lost and restarted empty, the system degrades gracefully (no data loss,
only a brief performance impact from cache misses).

## Authentication Safety

**SI-15** API keys are stored hashed only.
The `api_keys.key_hash` column stores `sha256(key)`. The plaintext key is shown exactly once
at creation time in the API response and never stored or logged.

**SI-16** OAuth PKCE is enforced where the provider supports it.
`oauth_state` is validated on callback. State tokens expire after 10 minutes (Valkey TTL).
CSRF protection requires exact state match.

**SI-17** Sessions are short-lived.
`sessions.expires_at` is set at creation. Max lifetime is 24 hours (`expires_in_seconds` max 86400).
Expired sessions are rejected at the middleware layer before any route handler runs.
