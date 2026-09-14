import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ctx = (file: string) =>
  JSON.parse(readFileSync(resolve(__dirname, 'context', file), 'utf8'));

const server = new McpServer({ name: 'arcane-context', version: '1.0.0' });

server.tool('get_project_overview', 'Full project overview — stack, repo structure, non-negotiables', {}, () => ({
  content: [{ type: 'text' as const, text: JSON.stringify(ctx('overview.json'), null, 2) }],
}));

server.tool('get_phase_status', 'All 21 phases with completion status and key files', {}, () => ({
  content: [{ type: 'text' as const, text: JSON.stringify(ctx('phases.json'), null, 2) }],
}));

server.tool('get_decisions', 'Architectural decision log — what was decided and why', {}, () => ({
  content: [{ type: 'text' as const, text: JSON.stringify(ctx('decisions.json'), null, 2) }],
}));

server.tool('get_invariants', 'All 17 security invariants with enforcement location', {}, () => ({
  content: [{ type: 'text' as const, text: JSON.stringify(ctx('invariants.json'), null, 2) }],
}));

server.tool('get_resume_point', 'Last session state — what was done, what is next, open issues', {}, () => ({
  content: [{ type: 'text' as const, text: JSON.stringify(ctx('resume.json'), null, 2) }],
}));

server.tool(
  'update_resume',
  'Update the resume point at the end of a session',
  {
    last_completed: z.string().describe('What was just finished'),
    next_up: z.string().describe('What to do next session'),
    open_issues: z.array(z.string()).optional().describe('Any unresolved issues or known gaps'),
    phase_updates: z.record(z.string(), z.string()).optional().describe('Phase status changes e.g. {"13": "done"}'),
  },
  ({ last_completed, next_up, open_issues, phase_updates }) => {
    const resume = ctx('resume.json');
    resume.last_completed = last_completed;
    resume.next_up = next_up;
    resume.open_issues = open_issues ?? resume.open_issues;
    resume.updated_at = new Date().toISOString();

    writeFileSync(
      resolve(__dirname, 'context', 'resume.json'),
      JSON.stringify(resume, null, 2),
    );

    if (phase_updates) {
      const phases = ctx('phases.json');
      for (const [num, status] of Object.entries(phase_updates)) {
        const phase = phases.find((p: { number: number }) => String(p.number) === num);
        if (phase) phase.status = status;
      }
      writeFileSync(
        resolve(__dirname, 'context', 'phases.json'),
        JSON.stringify(phases, null, 2),
      );
    }

    return { content: [{ type: 'text' as const, text: 'Resume point updated.' }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
