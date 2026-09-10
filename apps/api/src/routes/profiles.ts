import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { UploadProfileInputSchema } from '@tubesender/shared';
import { ProfileService } from '../services/profiles/profile.service.js';

export const profileRoutes: FastifyPluginAsync = async (app) => {
  // Lista todos os perfis de upload
  app.get('/profiles', async (_request, reply) => {
    const list = await ProfileService.listProfiles();
    return reply.send(list);
  });

  // Cria um novo perfil de upload
  app.post('/profiles', async (request, reply) => {
    const parsed = UploadProfileInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Dados do perfil inválidos',
        issues: parsed.error.issues,
      });
    }

    const created = await ProfileService.createProfile(parsed.data);
    return reply.status(201).send(created);
  });

  // Obtém um perfil por ID
  app.get('/profiles/:id', async (request, reply) => {
    const params = request.params as { id: string };
    try {
      const profile = await ProfileService.getProfile(params.id);
      return reply.send(profile);
    } catch {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Perfil de upload não encontrado',
      });
    }
  });

  // Atualiza um perfil existente
  app.put('/profiles/:id', async (request, reply) => {
    const params = request.params as { id: string };
    const parsed = UploadProfileInputSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Dados de atualização inválidos',
        issues: parsed.error.issues,
      });
    }

    const updated = await ProfileService.updateProfile(params.id, parsed.data);
    return reply.send(updated);
  });

  // Deleta um perfil
  app.delete('/profiles/:id', async (request, reply) => {
    const params = request.params as { id: string };
    await ProfileService.deleteProfile(params.id);
    return reply.send({ success: true });
  });

  // Define um perfil como padrão
  app.post('/profiles/:id/set-default', async (request, reply) => {
    const params = request.params as { id: string };
    const updated = await ProfileService.setDefault(params.id);
    return reply.send(updated);
  });

  // Cria um perfil a partir de um vídeo já existente no YouTube
  app.post('/profiles/from-video/:videoId', async (request, reply) => {
    const params = request.params as { videoId: string };
    const body = (request.body as { name?: string }) || {};

    try {
      const profile = await ProfileService.createFromVideo(params.videoId, body.name || '');
      return reply.status(201).send(profile);
    } catch (err: any) {
      return reply.status(400).send({
        error: 'Create Profile Error',
        message: err.message,
      });
    }
  });
};
