/**
 * Returns an ArcaneClient from stored/env config, or exits with an error
 * if no API key is configured.
 */

import { ArcaneClient } from '@arcane/sdk';
import { loadConfig, resolveApiKey, resolveBaseUrl } from './config.js';
import { fatal } from './output.js';

export function getClient(): ArcaneClient {
  const cfg = loadConfig();
  const apiKey = resolveApiKey(cfg.apiKey);
  if (!apiKey) {
    fatal('No API key configured. Run: arcane login');
  }
  const baseUrl = resolveBaseUrl(cfg.baseUrl);
  return new ArcaneClient({ apiKey, baseUrl });
}
