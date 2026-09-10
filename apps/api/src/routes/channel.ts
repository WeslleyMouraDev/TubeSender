import type { FastifyPluginAsync } from 'fastify';
import { YouTubeSyncService } from '../services/youtube/sync.service.js';
import { DashboardService } from '../services/youtube/dashboard.service.js';

export const channelRoutes: FastifyPluginAsync = async (app) => {
  // Sincroniza os vídeos e metadados do canal com o YouTube
  app.post('/channel/sync', async (_request, reply) => {
    try {
      const stats = await YouTubeSyncService.syncChannel();
      return reply.send({
        success: true,
        stats,
        message: 'Canal sincronizado com sucesso',
      });
    } catch (err: any) {
      return reply.status(500).send({
        error: 'Sync Failed',
        message: err.message || 'Falha ao sincronizar o canal com o YouTube',
      });
    }
  });

  // Retorna métricas consolidadas do Dashboard
  app.get('/dashboard', async (_request, reply) => {
    try {
      const data = await DashboardService.getDashboardData();
      return reply.send(data);
    } catch (err: any) {
      return reply.status(500).send({
        error: 'Dashboard Error',
        message: err.message || 'Falha ao carregar dados do Dashboard',
      });
    }
  });
};
