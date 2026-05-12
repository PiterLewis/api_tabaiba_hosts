import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { prisma } from '../lib/prisma.js';

const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  uptime: z.number(),
  timestamp: z.string(),
  database: z.enum(['ok', 'error']),
  version: z.string(),
});

export const healthRoutes: FastifyPluginAsync = async (app) => {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Health check público',
        response: { 200: healthResponseSchema },
      },
    },
    async () => {
      let database: 'ok' | 'error' = 'ok';
      try {
        // $queryRaw justificado: ping mínimo a la BD sin equivalente en query builder.
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        database = 'error';
      }
      return {
        status: database === 'ok' ? ('ok' as const) : ('degraded' as const),
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database,
        version: process.env['npm_package_version'] ?? '0.1.0',
      };
    },
  );
};
