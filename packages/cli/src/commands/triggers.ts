/**
 * arcane triggers list
 * arcane triggers create --slug <s> --name <n> --provider <p>
 * arcane triggers get <id>
 * arcane triggers delete <id>
 * arcane triggers subscribe <triggerId> --destination <destId> --user <userId>
 * arcane destinations create --name <n> --url <u>
 * arcane destinations list
 */

import { Command } from 'commander';
import { getClient } from '../sdk.js';
import { printJson, printTable, isJsonMode, success, info } from '../output.js';

export function buildTriggersCommands(program: Command): void {
  const triggers = program
    .command('triggers')
    .description('Manage event triggers');

  triggers
    .command('list')
    .description('List triggers')
    .option('--status <status>', 'Filter by status (ACTIVE|PAUSED|DELETED)')
    .option('--limit <n>', 'Max results', '20')
    .action(async (opts: { status?: string; limit: string }) => {
      const client = getClient();
      const status = opts.status as 'ACTIVE' | 'PAUSED' | 'DELETED' | undefined;
      const result = await client.triggers.list({
        ...(status !== undefined ? { status } : {}),
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
            { key: 'provider', label: 'PROVIDER', width: 14 },
            { key: 'status', label: 'STATUS', width: 10 },
            { key: 'id', label: 'ID', width: 36 },
          ],
        );
      }
    });

  triggers
    .command('create')
    .description('Create a trigger')
    .requiredOption('--slug <slug>', 'Unique slug for this trigger')
    .requiredOption('--name <name>', 'Human-readable name')
    .requiredOption('--provider <provider>', 'Provider (e.g. github, stripe)')
    .option('--description <desc>', 'Optional description')
    .action(async (opts: { slug: string; name: string; provider: string; description?: string }) => {
      const client = getClient();
      const result = await client.triggers.create({
        slug: opts.slug,
        name: opts.name,
        provider: opts.provider,
        ...(opts.description ? { description: opts.description } : {}),
      });
      if (isJsonMode()) {
        printJson(result);
      } else {
        success(`Trigger created: ${result.id}`);
        info(`Slug: ${result.slug} | Status: ${result.status}`);
      }
    });

  triggers
    .command('get <triggerId>')
    .description('Get a trigger by ID')
    .action(async (triggerId: string) => {
      const client = getClient();
      const result = await client.triggers.get(triggerId);
      if (isJsonMode()) {
        printJson(result);
      } else {
        console.log(`\nID       : ${result.id}`);
        console.log(`Slug     : ${result.slug}`);
        console.log(`Name     : ${result.name}`);
        console.log(`Provider : ${result.provider}`);
        console.log(`Status   : ${result.status}`);
        if (result.description) console.log(`Desc     : ${result.description}`);
        console.log(`Created  : ${result.created_at}`);
      }
    });

  triggers
    .command('delete <triggerId>')
    .description('Soft-delete a trigger')
    .action(async (triggerId: string) => {
      const client = getClient();
      await client.triggers.delete(triggerId);
      if (!isJsonMode()) success(`Trigger ${triggerId} deleted`);
    });

  triggers
    .command('subscribe <triggerId>')
    .description('Subscribe a user to a trigger')
    .requiredOption('--destination <destId>', 'Webhook destination ID')
    .requiredOption('--user <userId>', 'External user ID')
    .action(async (triggerId: string, opts: { destination: string; user: string }) => {
      const client = getClient();
      const result = await client.triggers.subscribe(triggerId, {
        destination_id: opts.destination,
        external_user_id: opts.user,
      });
      if (isJsonMode()) {
        printJson(result);
      } else {
        success(`Subscribed: ${result.id}`);
      }
    });

  // ── Destinations ───────────────────────────────────────────────────────────

  const destinations = program
    .command('destinations')
    .description('Manage webhook destinations');

  destinations
    .command('list')
    .description('List webhook destinations')
    .action(async () => {
      const client = getClient();
      const result = await client.triggers.listDestinations();
      if (isJsonMode()) {
        printJson(result);
      } else {
        printTable(
          result.data.map((d) => ({ ...d })),
          [
            { key: 'name', label: 'NAME', width: 24 },
            { key: 'url', label: 'URL', width: 40 },
            { key: 'status', label: 'STATUS', width: 10 },
            { key: 'id', label: 'ID', width: 36 },
          ],
        );
      }
    });

  destinations
    .command('create')
    .description('Create a webhook destination')
    .requiredOption('--name <name>', 'Display name')
    .requiredOption('--url <url>', 'Webhook URL')
    .option('--secret <secret>', 'Signing secret (stored as secret_reference)')
    .action(async (opts: { name: string; url: string; secret?: string }) => {
      const client = getClient();
      const result = await client.triggers.createDestination({
        name: opts.name,
        url: opts.url,
        ...(opts.secret ? { signing_secret: opts.secret } : {}),
      });
      if (isJsonMode()) {
        printJson(result);
      } else {
        success(`Destination created: ${result.id}`);
        info(`URL: ${result.url}`);
      }
    });

  destinations
    .command('delete <destinationId>')
    .description('Delete a webhook destination')
    .action(async (destinationId: string) => {
      const client = getClient();
      await client.triggers.deleteDestination(destinationId);
      if (!isJsonMode()) success(`Destination ${destinationId} deleted`);
    });
}
