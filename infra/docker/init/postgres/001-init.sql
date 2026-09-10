-- Arcane PostgreSQL initialization
-- Runs once on first container start

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Set timezone
SET timezone = 'UTC';

-- Create read-only role for observability/analytics
CREATE ROLE arcane_readonly;
GRANT CONNECT ON DATABASE arcane TO arcane_readonly;
GRANT USAGE ON SCHEMA public TO arcane_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO arcane_readonly;

-- Create migration role
CREATE ROLE arcane_migrator;
GRANT CONNECT ON DATABASE arcane TO arcane_migrator;
GRANT CREATE ON SCHEMA public TO arcane_migrator;

GRANT arcane_migrator TO arcane;
