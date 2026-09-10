import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import type { OperationLogDTO } from '@tubesender/shared';

export const logRoutes: FastifyPluginAsync = async (app) => {
  // Lista logs estruturados da aplicação
  app.get('/logs', async (request, reply) => {
    const querySchema = z.object({
      level: z.enum(['ALL', 'INFO', 'WARN', 'ERROR']).default('ALL'),
      category: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Parâmetros de filtro de logs inválidos',
        issues: parsed.error.issues,
      });
    }

    const { level, category, limit } = parsed.data;
    const where: any = {};

    if (level !== 'ALL') {
      where.level = level;
    }

    if (category) {
      where.category = category;
    }

    const logs = await prisma.operationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const mapped: OperationLogDTO[] = logs.map((log) => {
      let meta = null;
      if (log.metadata) {
        try {
          meta = JSON.parse(log.metadata);
          // Sanitização adicional garantindo que nenhum token ou senha vaze
          if (meta.accessToken) meta.accessToken = '***';
          if (meta.refreshToken) meta.refreshToken = '***';
          if (meta.clientSecret) meta.clientSecret = '***';
        } catch {
          meta = null;
        }
      }

      return {
        id: log.id,
        level: log.level as 'INFO' | 'WARN' | 'ERROR',
        category: log.category as any,
        message: log.message,
        metadata: meta,
        createdAt: log.createdAt.toISOString(),
      };
    });

    return reply.send({
      items: mapped,
      total: logs.length,
    });
  });
};
