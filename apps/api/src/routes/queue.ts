import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';
import { UploadQueueService } from '../services/upload/queue.service.js';
import { ThumbnailService } from '../services/youtube/thumbnail.service.js';
import { PlaylistService } from '../services/youtube/playlist.service.js';
import { sseBroker } from '../events/sse.js';

export const queueRoutes: FastifyPluginAsync = async (app) => {
  // Stream de eventos em tempo real (SSE)
  app.get('/events', async (request, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    // Envia ping inicial
    reply.raw.write('event: connected\ndata: {"status":"connected"}\n\n');

    sseBroker.addClient(reply.raw);

    // Evita fechamento automático do Fastify
    await new Promise((_resolve) => {
      request.raw.on('close', () => {
        _resolve(null);
      });
    });
  });

  // Inicia o processamento do lote
  app.post('/queue/start/:batchId', async (request, reply) => {
    const params = request.params as { batchId: string };
    await UploadQueueService.startBatch(params.batchId);
    return reply.send({ success: true, message: 'Fila iniciada com sucesso' });
  });

  // Pausa o processamento do lote
  app.post('/queue/pause/:batchId', async (request, reply) => {
    const params = request.params as { batchId: string };
    await UploadQueueService.pauseBatch(params.batchId);
    return reply.send({ success: true, message: 'Fila pausada' });
  });

  // Cancela o lote e os vídeos pendentes
  app.post('/queue/cancel/:batchId', async (request, reply) => {
    const params = request.params as { batchId: string };
    await UploadQueueService.cancelBatch(params.batchId);
    return reply.send({ success: true, message: 'Lote cancelado' });
  });

  // Tenta novamente o upload de um vídeo com falha
  app.post('/queue/retry/:draftId', async (request, reply) => {
    const params = request.params as { draftId: string };
    await UploadQueueService.retryDraft(params.draftId);
    return reply.send({ success: true, message: 'Upload colocado novamente na fila' });
  });

  // Retry pontual de thumbnail sem repetir upload do vídeo (FASE 9)
  app.post('/queue/retry-thumbnail/:draftId', async (request, reply) => {
    const params = request.params as { draftId: string };
    const draft = await prisma.videoDraft.findUnique({
      where: { id: params.draftId },
    });

    if (!draft) {
      return reply.status(404).send({ error: 'Not Found', message: 'Rascunho não encontrado' });
    }

    if (!draft.youtubeVideoId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Vídeo ainda não foi enviado ao YouTube para receber thumbnail',
      });
    }

    if (!draft.thumbnailPath) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Rascunho não possui miniatura configurada',
      });
    }

    try {
      await ThumbnailService.setThumbnail(draft.youtubeVideoId, draft.thumbnailPath);
      return reply.send({ success: true, message: 'Thumbnail aplicada com sucesso' });
    } catch (err: any) {
      return reply.status(500).send({
        error: 'Thumbnail Error',
        message: err.message || 'Falha ao aplicar thumbnail no YouTube',
      });
    }
  });

  // Retry pontual de inserção em playlist sem repetir upload do vídeo (FASE 9)
  app.post('/queue/retry-playlist/:draftId', async (request, reply) => {
    const params = request.params as { draftId: string };
    const draft = await prisma.videoDraft.findUnique({
      where: { id: params.draftId },
    });

    if (!draft) {
      return reply.status(404).send({ error: 'Not Found', message: 'Rascunho não encontrado' });
    }

    if (!draft.youtubeVideoId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Vídeo ainda não foi enviado ao YouTube para ser adicionado à playlist',
      });
    }

    if (!draft.playlistId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Rascunho não possui playlist configurada',
      });
    }

    try {
      await PlaylistService.addToPlaylist(draft.youtubeVideoId, draft.playlistId);
      return reply.send({ success: true, message: 'Vídeo adicionado à playlist com sucesso' });
    } catch (err: any) {
      return reply.status(500).send({
        error: 'Playlist Error',
        message: err.message || 'Falha ao adicionar vídeo à playlist no YouTube',
      });
    }
  });
};
