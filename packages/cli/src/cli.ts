#!/usr/bin/env node
/**
 * Arcane CLI — developer tooling for the Arcane platform.
 *
 * Commands (Phase 5+):
 *   arcane connector init       — scaffold a new connector from template
 *   arcane connector validate   — validate connector manifest
 *   arcane connector publish    — publish connector to registry
 *   arcane env create           — create environment
 *   arcane key create           — create API key
 *   arcane exec run <tool>      — execute a tool from the CLI
 */

import { program } from 'commander';

program
  .name('arcane')
  .description('Arcane platform CLI')
  .version('0.1.0');

program
  .command('connector')
  .description('Connector management commands')
  .addHelpText('after', '\nRun arcane connector <command> --help for details.');

program.parse();
