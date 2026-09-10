/**
 * Health check routes — /health and /ready
 *
 * /health — liveness probe (process is running)
 * /ready  — readiness probe (can serve traffic: DB + downstream OK)
 */

import type { FastifyInstance } from 'fastify';
import { checkDbHealth } from '@arcane/core';

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness — always 200 if process is alive
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness probe',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok'] },
              service: { type: 'string' },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      return reply.send({ status: 'ok', service: 'arcane-api' });
    },
  );

  // Readiness — checks DB
  app.get(
    '/ready',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness probe',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ready', 'degraded'] },
              checks: {
                type: 'object',
                properties: {
                  database: { type: 'boolean' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['not_ready'] },
              checks: {
                type: 'object',
                properties: {
                  database: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      const database = await checkDbHealth();
      const allOk = database;

      if (allOk) {
        return reply.send({ status: 'ready', checks: { database } });
      }

      return reply.status(503).send({ status: 'not_ready', checks: { database } });
    },
  );
}
