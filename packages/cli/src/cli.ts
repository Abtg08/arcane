#!/usr/bin/env node
/**
 * Arcane CLI — developer tooling for the Arcane platform.
 *
 * Commands:
 *   arcane login                          — store API key
 *   arcane whoami                         — show current credentials
 *   arcane logout                         — remove stored API key
 *   arcane toolkits list [-q query]       — list toolkits
 *   arcane tools list <toolkit>           — list tools in a toolkit
 *   arcane tools get <toolkit> <tool>     — show tool detail + schema
 *   arcane exec run <toolkit.tool> -c <conn> -i '<json>' [--wait]
 *   arcane exec get <executionId>         — poll execution status
 *   arcane exec wait <executionId>        — block until terminal status
 *   arcane exec list                      — list recent executions
 *   arcane triggers list                  — list triggers
 *   arcane triggers create                — create trigger
 *   arcane triggers get <id>              — show trigger
 *   arcane triggers delete <id>           — soft-delete trigger
 *   arcane triggers subscribe <id>        — subscribe user to trigger
 *   arcane destinations list              — list webhook destinations
 *   arcane destinations create            — create webhook destination
 *   arcane destinations delete <id>       — delete destination
 */

import { program } from 'commander';
import { setJsonMode } from './output.js';
import { buildAuthCommands } from './commands/auth.js';
import { buildToolkitsCommands } from './commands/toolkits.js';
import { buildExecCommands } from './commands/exec.js';
import { buildTriggersCommands } from './commands/triggers.js';
import { ArcaneApiError, ArcaneAuthError, ArcaneTimeoutError, ArcaneError } from '@arcane/sdk';

program
  .name('arcane')
  .description('Arcane platform CLI')
  .version('0.1.0')
  .option('--json', 'Output as JSON (machine-readable)')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts() as { json?: boolean };
    setJsonMode(opts.json === true);
  });

buildAuthCommands(program);
buildToolkitsCommands(program);
buildExecCommands(program);
buildTriggersCommands(program);

// ── Global error handler ──────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  if (err instanceof ArcaneAuthError) {
    console.error(`Authentication error: ${err.message}`);
    console.error('Run: arcane login --key <apiKey>');
  } else if (err instanceof ArcaneTimeoutError) {
    console.error(`Timeout: ${err.message}`);
  } else if (err instanceof ArcaneApiError) {
    console.error(`API error ${err.status}: ${err.message}`);
    if (err.requestId) console.error(`Request ID: ${err.requestId}`);
  } else if (err instanceof ArcaneError) {
    console.error(`Error: ${err.message}`);
  } else {
    console.error(`Unexpected error: ${String(err)}`);
  }
  process.exit(1);
});

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof ArcaneAuthError) {
    console.error(`Authentication error: ${(err as Error).message}`);
    console.error('Run: arcane login --key <apiKey>');
  } else if (err instanceof ArcaneTimeoutError) {
    console.error(`Timeout: ${(err as Error).message}`);
  } else if (err instanceof ArcaneApiError) {
    console.error(`API error ${err.status}: ${(err as Error).message}`);
  } else if (err instanceof ArcaneError) {
    console.error(`Error: ${(err as Error).message}`);
  } else {
    console.error(`Unexpected error: ${String(err)}`);
  }
  process.exit(1);
});
