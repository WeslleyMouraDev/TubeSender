import type { FastifyPluginAsync } from 'fastify';
import type { HealthResponse } from '@tubesender/shared';
import { prisma } from '../db/prisma.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    let dbStatus: 'ok' | 'error' = 'ok';
    let youtubeAuth: 'connected' | 'disconnected' = 'disconnected';

    try {
      // Teste de conectividade com SQLite
      await prisma.$queryRaw`SELECT 1`;

      // Verifica se há canal com credenciais OAuth vinculadas
      const activeAccount = await prisma.oAuthAccount.findFirst({
        select: { id: true },
      });
      if (activeAccount) {
        youtubeAuth = 'connected';
      }
    } catch {
      dbStatus = 'error';
    }

    const isHealthy = dbStatus === 'ok';

    const response: HealthResponse = {
      status: isHealthy ? 'ok' : 'error',
      database: dbStatus,
      youtubeAuth,
      timestamp: new Date().toISOString(),
    };

    return reply.status(isHealthy ? 200 : 503).send(response);
  });
};
