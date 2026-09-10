import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import type { SyncedVideoDTO, VideoPrivacyStatus } from '@tubesender/shared';

export const videoRoutes: FastifyPluginAsync = async (app) => {
  // Lista vídeos sincronizados com filtros e busca
  app.get('/videos', async (request, reply) => {
    const querySchema = z.object({
      status: z.enum(['all', 'published', 'scheduled', 'private']).default('all'),
      search: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Parâmetros de busca inválidos',
        issues: parsed.error.issues,
      });
    }

    const { status, search, page, limit } = parsed.data;
    const now = new Date();

    const where: any = {};

    if (search && search.trim().length > 0) {
      where.title = {
        contains: search.trim(),
      };
    }

    if (status === 'published') {
      where.privacyStatus = 'public';
    } else if (status === 'scheduled') {
      where.privacyStatus = 'private';
      where.publishAt = { gt: now };
    } else if (status === 'private') {
      where.privacyStatus = 'private';
      where.OR = [{ publishAt: null }, { publishAt: { lte: now } }];
    }

    const [total, items] = await Promise.all([
      prisma.syncedVideo.count({ where }),
      prisma.syncedVideo.findMany({
        where,
        orderBy: [{ publishAt: 'desc' }, { publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const mapped: SyncedVideoDTO[] = items.map((v) => {
      let thumbnails = null;
      if (v.thumbnails) {
        try {
          thumbnails = JSON.parse(v.thumbnails);
        } catch {
          thumbnails = null;
        }
      }

      let tags: string[] = [];
      if (v.tags) {
        try {
          tags = JSON.parse(v.tags);
        } catch {
          tags = [];
        }
      }

      return {
        id: v.id,
        channelId: v.channelId,
        youtubeVideoId: v.youtubeVideoId,
        title: v.title,
        description: v.description,
        privacyStatus: v.privacyStatus as VideoPrivacyStatus,
        publishAt: v.publishAt ? v.publishAt.toISOString() : null,
        publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
        thumbnails,
        tags,
        categoryId: v.categoryId,
        madeForKids: v.madeForKids,
        containsSyntheticMedia: v.containsSyntheticMedia,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      };
    });

    return reply.send({
      items: mapped,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  });

  // Detalhes completos de um vídeo
  app.get('/videos/:id', async (request, reply) => {
    const params = request.params as { id: string };

    const video = await prisma.syncedVideo.findFirst({
      where: {
        OR: [{ id: params.id }, { youtubeVideoId: params.id }],
      },
    });

    if (!video) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Vídeo não encontrado no histórico local',
      });
    }

    let thumbnails = null;
    if (video.thumbnails) {
      try {
        thumbnails = JSON.parse(video.thumbnails);
      } catch {
        thumbnails = null;
      }
    }

    let tags: string[] = [];
    if (video.tags) {
      try {
        tags = JSON.parse(video.tags);
      } catch {
        tags = [];
      }
    }

    return reply.send({
      id: video.id,
      channelId: video.channelId,
      youtubeVideoId: video.youtubeVideoId,
      title: video.title,
      description: video.description,
      privacyStatus: video.privacyStatus,
      publishAt: video.publishAt ? video.publishAt.toISOString() : null,
      publishedAt: video.publishedAt ? video.publishedAt.toISOString() : null,
      thumbnails,
      tags,
      categoryId: video.categoryId,
      madeForKids: video.madeForKids,
      containsSyntheticMedia: video.containsSyntheticMedia,
      createdAt: video.createdAt.toISOString(),
      updatedAt: video.updatedAt.toISOString(),
    });
  });
};
