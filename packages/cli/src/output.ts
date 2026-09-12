/**
 * Shared output helpers for the Arcane CLI.
 * Handles --json flag for machine-readable output and pretty tables for humans.
 */

import chalk from 'chalk';

let jsonMode = false;

export function setJsonMode(val: boolean): void {
  jsonMode = val;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

/** Print a success message (suppressed in --json mode) */
export function success(msg: string): void {
  if (!jsonMode) console.log(chalk.green('✓') + ' ' + msg);
}

/** Print an info message (suppressed in --json mode) */
export function info(msg: string): void {
  if (!jsonMode) console.log(chalk.dim(msg));
}

/** Print an error message (always printed, to stderr) */
export function error(msg: string): void {
  console.error(chalk.red('✗') + ' ' + msg);
}

/** Print JSON data (--json mode) or a formatted object (human mode) */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/** Print a table of objects */
export function printTable(
  rows: Record<string, unknown>[],
  columns: { key: string; label: string; width?: number }[],
): void {
  if (rows.length === 0) {
    info('No results.');
    return;
  }

  // Header
  const header = columns
    .map((c) => c.label.padEnd(c.width ?? 20))
    .join('  ');
  console.log(chalk.bold(header));
  console.log(chalk.dim('─'.repeat(header.length)));

  // Rows
  for (const row of rows) {
    const line = columns
      .map((c) => {
        const val = String(row[c.key] ?? '');
        return val.padEnd(c.width ?? 20);
      })
      .join('  ');
    console.log(line);
  }
}

/** Exit with error message and code 1 */
export function fatal(msg: string): never {
  error(msg);
  process.exit(1);
}
