import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BatchService } from '../services/batch/batch.service.js';

export const batchRoutes: FastifyPluginAsync = async (app) => {
  // Retorna o lote atual de rascunhos ou cria um se não houver
  app.get('/batches/current', async (_request, reply) => {
    const batch = await BatchService.getCurrentBatch();
    return reply.send(batch);
  });

  // Cria um novo lote limpo
  app.post('/batches', async (_request, reply) => {
    const batch = await BatchService.createBatch();
    return reply.status(201).send(batch);
  });

  // Adiciona arquivos como drafts no lote
  app.post('/batches/:id/drafts', async (request, reply) => {
    const params = request.params as { id: string };
    const bodySchema = z.object({
      files: z.array(
        z.object({
          filename: z.string().min(1),
          localPath: z.string().min(1),
          fileSize: z.number().optional(),
          title: z.string().optional(),
        })
      ).min(1),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Lista de arquivos inválida',
        issues: parsed.error.issues,
      });
    }

    const batch = await BatchService.addDrafts(params.id, parsed.data.files);
    return reply.send(batch);
  });

  // Atualiza dados de um draft específico
  app.put('/batches/:id/drafts/:draftId', async (request, reply) => {
    const params = request.params as { id: string; draftId: string };
    const bodySchema = z.object({
      title: z.string().min(1).optional(),
      customDescription: z.string().nullable().optional(),
      customTags: z.array(z.string()).optional(),
      thumbnailPath: z.string().nullable().optional(),
      playlistId: z.string().nullable().optional(),
      scheduledAt: z.string().nullable().optional(),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Dados de atualização do vídeo inválidos',
        issues: parsed.error.issues,
      });
    }

    const updated = await BatchService.updateDraft(params.draftId, parsed.data);
    return reply.send(updated);
  });

  // Remove um draft do lote
  app.delete('/batches/:id/drafts/:draftId', async (request, reply) => {
    const params = request.params as { id: string; draftId: string };
    const batch = await BatchService.deleteDraft(params.draftId);
    return reply.send(batch);
  });

  // Reordena os drafts do lote (drag-and-drop)
  app.post('/batches/:id/reorder', async (request, reply) => {
    const params = request.params as { id: string };
    const bodySchema = z.object({
      draftIds: z.array(z.string()).min(1),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Array de IDs para ordenação inválido',
      });
    }

    const batch = await BatchService.reorderDrafts(params.id, parsed.data.draftIds);
    return reply.send(batch);
  });

  // Aplica o cálculo do Scheduler nos drafts do lote
  app.post('/batches/:id/apply-schedule', async (request, reply) => {
    const params = request.params as { id: string };
    const bodySchema = z.object({
      slots: z.array(z.string()).min(1),
      timezone: z.string().default('America/Recife'),
      minimumLeadMinutes: z.number().default(10),
      useLastScheduled: z.boolean().default(true),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Configurações de agendamento inválidas',
      });
    }

    try {
      const batch = await BatchService.applyScheduleToBatch(params.id, parsed.data);
      return reply.send(batch);
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Schedule Application Error',
        message: err.message,
      });
    }
  });

  // Aplica metadados de um perfil de upload aos drafts do lote (FASE 8)
  app.post('/batches/:id/apply-profile', async (request, reply) => {
    const params = request.params as { id: string };
    const bodySchema = z.object({
      profileId: z.string().min(1),
    });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'ID de perfil inválido',
      });
    }

    try {
      const batch = await BatchService.applyProfileToBatch(params.id, parsed.data.profileId);
      return reply.send(batch);
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Apply Profile Error',
        message: err.message,
      });
    }
  });
};
