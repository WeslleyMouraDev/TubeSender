import type { FastifyPluginAsync } from 'fastify';
import { ScheduleSlotInputSchema } from '@tubesender/shared';
import { SchedulerService } from '../services/scheduler/scheduler.service.js';
import { prisma } from '../db/prisma.js';

export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  // Gera prévia determinística de agendamentos
  app.post('/schedule/preview', async (request, reply) => {
    const parsed = ScheduleSlotInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Parâmetros de configuração de agenda inválidos',
        issues: parsed.error.issues,
      });
    }

    const { videoCount, slots, timezone, minimumLeadMinutes, useLastScheduled } = parsed.data;

    let lastScheduledAtStr: string | null = null;
    let lastScheduledAtDate: Date | null = null;

    if (useLastScheduled) {
      const now = new Date();
      const lastVideo = await prisma.syncedVideo.findFirst({
        where: {
          privacyStatus: 'private',
          publishAt: {
            gt: now,
          },
        },
        orderBy: {
          publishAt: 'desc',
        },
      });

      if (lastVideo?.publishAt) {
        lastScheduledAtDate = lastVideo.publishAt;
        lastScheduledAtStr = lastVideo.publishAt.toISOString();
      }
    }

    try {
      const dates = SchedulerService.buildSchedule({
        videoCount,
        slots,
        timezone,
        minimumLeadMinutes,
        lastScheduledAt: lastScheduledAtDate,
      });

      const response = SchedulerService.formatPreview(dates, timezone, lastScheduledAtStr);
      return reply.send(response);
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Schedule Calculation Error',
        message: err.message || 'Erro ao calcular a agenda',
      });
    }
  });
};
