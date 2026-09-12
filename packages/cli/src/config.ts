/**
 * CLI config — persists API key and default settings in ~/.arcane/config.json.
 * All reads/writes are best-effort: missing config is not an error at read time.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface CliConfig {
  apiKey?: string;
  baseUrl?: string;
  environmentId?: string;
}

function configDir(): string {
  return join(homedir(), '.arcane');
}

function configPath(): string {
  return join(configDir(), 'config.json');
}

export function loadConfig(): CliConfig {
  const p = configPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as CliConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: CliConfig): void {
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  writeFileSync(configPath(), JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function mergeConfig(patch: Partial<CliConfig>): void {
  const current = loadConfig();
  saveConfig({ ...current, ...patch });
}

/** Resolve API key: env var overrides stored config */
export function resolveApiKey(stored?: string): string | undefined {
  return process.env['ARCANE_API_KEY'] ?? stored;
}

/** Resolve base URL: env var overrides stored config */
export function resolveBaseUrl(stored?: string): string {
  return process.env['ARCANE_BASE_URL'] ?? stored ?? 'https://api.arcane.run/v1';
}
