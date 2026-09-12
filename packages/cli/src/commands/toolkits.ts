/**
 * arcane toolkits list   — list available toolkits
 * arcane tools list <tk> — list tools in a toolkit
 * arcane tools get <tk> <tool> — show tool detail
 */

import { Command } from 'commander';
import { getClient } from '../sdk.js';
import { printJson, printTable, isJsonMode, info } from '../output.js';

export function buildToolkitsCommands(program: Command): void {
  const toolkits = program
    .command('toolkits')
    .description('Browse available toolkits');

  toolkits
    .command('list')
    .description('List available toolkits')
    .option('-q, --query <search>', 'Filter by name/description')
    .option('--limit <n>', 'Max results', '20')
    .action(async (opts: { query?: string; limit: string }) => {
      const client = getClient();
      const result = await client.tools.listToolkits({
        ...(opts.query !== undefined ? { q: opts.query } : {}),
        limit: parseInt(opts.limit, 10),
      });
      if (isJsonMode()) {
        printJson(result);
      } else {
        printTable(
          result.data.map((t) => ({ ...t })),
          [
            { key: 'slug', label: 'SLUG', width: 20 },
            { key: 'name', label: 'NAME', width: 24 },
            { key: 'provider', label: 'PROVIDER', width: 16 },
            { key: 'status', label: 'STATUS', width: 10 },
          ],
        );
        if (result.next_cursor) info(`\nMore results — use --cursor ${result.next_cursor}`);
      }
    });

  const tools = program
    .command('tools')
    .description('Browse tools within a toolkit');

  tools
    .command('list <toolkit>')
    .description('List tools in a toolkit')
    .option('--limit <n>', 'Max results', '20')
    .action(async (toolkit: string, opts: { limit: string }) => {
      const client = getClient();
      const result = await client.tools.listTools(toolkit, {
        limit: parseInt(opts.limit, 10),
      });
      if (isJsonMode()) {
        printJson(result);
      } else {
        printTable(
          result.data.map((t) => ({ ...t })),
          [
            { key: 'slug', label: 'SLUG', width: 24 },
            { key: 'name', label: 'NAME', width: 28 },
            { key: 'action_type', label: 'TYPE', width: 14 },
            { key: 'status', label: 'STATUS', width: 10 },
          ],
        );
      }
    });

  tools
    .command('get <toolkit> <tool>')
    .description('Show tool details including input/output schema')
    .action(async (toolkit: string, tool: string) => {
      const client = getClient();
      const result = await client.tools.getTool(toolkit, tool);
      if (isJsonMode()) {
        printJson(result);
      } else {
        console.log(`\n${result.name} (${result.slug})`);
        console.log(`Description : ${result.description}`);
        console.log(`Action type : ${result.action_type}`);
        console.log(`Status      : ${result.status}`);
        if (result.latest_version) {
          console.log(`Version     : ${result.latest_version.version}`);
        }
        console.log('\nInput schema:');
        console.log(JSON.stringify(result.input_schema, null, 2));
        console.log('\nOutput schema:');
        console.log(JSON.stringify(result.output_schema, null, 2));
      }
    });
}
