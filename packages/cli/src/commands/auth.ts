/**
 * arcane login  — save API key to ~/.arcane/config.json
 * arcane whoami — show current credentials
 * arcane logout — remove stored API key
 */

import { Command } from 'commander';
import { mergeConfig, loadConfig, saveConfig, resolveApiKey, resolveBaseUrl } from '../config.js';
import { success, info, error, printJson, isJsonMode, fatal } from '../output.js';
import { ArcaneClient, ArcaneApiError } from '@arcane/sdk';

export function buildAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Authenticate with the Arcane platform')
    .option('--key <apiKey>', 'API key to store (or set ARCANE_API_KEY env var)')
    .option('--url <baseUrl>', 'API base URL (default: https://api.arcane.run/v1)')
    .action(async (opts: { key?: string; url?: string }) => {
      const apiKey = opts.key ?? process.env['ARCANE_API_KEY'];
      if (!apiKey) {
        fatal('Provide an API key with --key or set ARCANE_API_KEY');
      }
      const baseUrl = opts.url ?? resolveBaseUrl();

      // Validate the key by hitting /whoami or a lightweight endpoint
      try {
        const client = new ArcaneClient({ apiKey, baseUrl });
        // list toolkits as a lightweight probe
        await client.tools.listToolkits({ limit: 1 });
      } catch (err_) {
        if (err_ instanceof ArcaneApiError && (err_.status === 401 || err_.status === 403)) {
          fatal('Invalid API key — authentication failed');
        }
        // network errors etc — save anyway and warn
        error('Could not reach the API to verify the key — saving anyway');
      }

      mergeConfig({ apiKey, ...(opts.url ? { baseUrl: opts.url } : {}) });
      success(`API key saved to ~/.arcane/config.json`);
      info(`Base URL: ${baseUrl}`);
    });

  program
    .command('whoami')
    .description('Show current authentication config')
    .action(() => {
      const cfg = loadConfig();
      const apiKey = resolveApiKey(cfg.apiKey);
      const baseUrl = resolveBaseUrl(cfg.baseUrl);

      if (!apiKey) {
        error('Not logged in. Run: arcane login --key <apiKey>');
        process.exit(1);
      }

      const masked = `${apiKey.slice(0, 8)}${'*'.repeat(Math.max(0, apiKey.length - 12))}${apiKey.slice(-4)}`;
      if (isJsonMode()) {
        printJson({ apiKey: masked, baseUrl, source: cfg.apiKey ? 'config' : 'env' });
      } else {
        info(`API key : ${masked}`);
        info(`Base URL: ${baseUrl}`);
        info(`Source  : ${cfg.apiKey ? '~/.arcane/config.json' : 'ARCANE_API_KEY env var'}`);
      }
    });

  program
    .command('logout')
    .description('Remove stored API key')
    .action(() => {
      const cfg = loadConfig();
      const { apiKey: _removed, ...rest } = cfg;
      saveConfig(rest);
      success('API key removed from ~/.arcane/config.json');
    });
}
