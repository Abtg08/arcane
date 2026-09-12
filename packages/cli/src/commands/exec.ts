/**
 * arcane exec run <toolkit.tool> --connection <id> --input '<json>'
 * arcane exec get <execution-id>
 * arcane exec wait <execution-id>
 * arcane exec list
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { getClient } from '../sdk.js';
import { printJson, printTable, isJsonMode, info, fatal } from '../output.js';
import type { Execution } from '@arcane/sdk';

function statusColor(status: string): string {
  switch (status) {
    case 'SUCCEEDED': return chalk.green(status);
    case 'FAILED':
    case 'REJECTED':
    case 'TIMED_OUT': return chalk.red(status);
    case 'RUNNING': return chalk.yellow(status);
    default: return chalk.dim(status);
  }
}

function printExecution(exec: Execution): void {
  console.log(`\nExecution  : ${exec.id}`);
  console.log(`Status     : ${statusColor(exec.status)}`);
  console.log(`Tool       : ${exec.tool_version_id}`);
  console.log(`Connection : ${exec.connection_id}`);
  if (exec.started_at) console.log(`Started    : ${exec.started_at}`);
  if (exec.completed_at) console.log(`Completed  : ${exec.completed_at}`);
  if (exec.error) console.log(chalk.red(`Error      : ${exec.error}`));
  if (exec.output) {
    console.log('\nOutput:');
    console.log(JSON.stringify(exec.output, null, 2));
  }
}

export function buildExecCommands(program: Command): void {
  const exec = program
    .command('exec')
    .description('Execute tools and inspect results');

  exec
    .command('run <tool>')
    .description('Run a tool (format: toolkit.tool_slug)')
    .requiredOption('-c, --connection <id>', 'Connection ID to use')
    .option('-i, --input <json>', 'Input JSON (e.g. \'{"owner":"acme"}\')', '{}')
    .option('--wait', 'Wait for the execution to complete before exiting')
    .option('--timeout <ms>', 'Wait timeout in ms (default 120000)', '120000')
    .action(async (tool: string, opts: { connection: string; input: string; wait?: boolean; timeout: string }) => {
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(opts.input) as Record<string, unknown>;
      } catch {
        fatal(`Invalid JSON in --input: ${opts.input}`);
      }

      const client = getClient();
      const spinner = isJsonMode() ? null : ora(`Executing ${tool}…`).start();

      const result = await client.executions.execute({
        tool,
        connection_id: opts.connection,
        input,
      });

      spinner?.succeed(`Execution started: ${result.execution_id}`);

      if (opts.wait) {
        const waitSpinner = isJsonMode() ? null : ora('Waiting for completion…').start();
        const done = await client.executions.waitFor(result.execution_id, {
          timeoutMs: parseInt(opts.timeout, 10),
        });
        waitSpinner?.stop();
        if (isJsonMode()) {
          printJson(done);
        } else {
          printExecution(done);
        }
      } else {
        if (isJsonMode()) {
          printJson(result);
        } else {
          info(`\nPoll with: arcane exec get ${result.execution_id}`);
          info(`Wait with: arcane exec wait ${result.execution_id}`);
        }
      }
    });

  exec
    .command('get <executionId>')
    .description('Get execution status and output')
    .action(async (executionId: string) => {
      const client = getClient();
      const result = await client.executions.get(executionId);
      if (isJsonMode()) {
        printJson(result);
      } else {
        printExecution(result);
      }
    });

  exec
    .command('wait <executionId>')
    .description('Wait for an execution to complete')
    .option('--timeout <ms>', 'Timeout in ms (default 120000)', '120000')
    .action(async (executionId: string, opts: { timeout: string }) => {
      const client = getClient();
      const spinner = isJsonMode() ? null : ora('Waiting for completion…').start();
      const result = await client.executions.waitFor(executionId, {
        timeoutMs: parseInt(opts.timeout, 10),
      });
      spinner?.stop();
      if (isJsonMode()) {
        printJson(result);
      } else {
        printExecution(result);
      }
    });

  exec
    .command('list')
    .description('List recent executions')
    .option('--limit <n>', 'Max results', '20')
    .action(async (opts: { limit: string }) => {
      const client = getClient();
      const result = await client.executions.list({ limit: parseInt(opts.limit, 10) });
      if (isJsonMode()) {
        printJson(result);
      } else {
        printTable(
          result.data.map((e) => ({
            id: e.id.slice(0, 16) + '…',
            status: e.status,
            tool: e.tool_version_id.slice(0, 24),
            created_at: e.created_at,
          })),
          [
            { key: 'id', label: 'ID', width: 20 },
            { key: 'status', label: 'STATUS', width: 14 },
            { key: 'tool', label: 'TOOL VERSION', width: 26 },
            { key: 'created_at', label: 'CREATED', width: 24 },
          ],
        );
      }
    });
}
