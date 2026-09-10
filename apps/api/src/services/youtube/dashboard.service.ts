import { prisma } from '../../db/prisma.js';
import type { DashboardData } from '@tubesender/shared';

export class DashboardService {
  public static async getDashboardData(): Promise<DashboardData> {
    const channel = await prisma.channel.findFirst({
      include: { syncState: true },
    });

    if (!channel) {
      return {
        channel: null,
        counts: {
          published: 0,
          scheduled: 0,
          private: 0,
          drafts: 0,
        },
        nextScheduled: null,
        lastScheduled: null,
        lastSyncedAt: null,
      };
    }

    const now = new Date();

    // Contagem de vídeos publicados (privacyStatus = 'public')
    const publishedCount = await prisma.syncedVideo.count({
      where: {
        channelId: channel.id,
        privacyStatus: 'public',
      },
    });

    // Contagem de vídeos agendados (privacyStatus = 'private' && publishAt > now)
    const scheduledCount = await prisma.syncedVideo.count({
      where: {
        channelId: channel.id,
        privacyStatus: 'private',
        publishAt: {
          gt: now,
        },
      },
    });

    // Contagem de vídeos estritamente privados (privacyStatus = 'private' && (publishAt is null or publishAt <= now))
    const privateCount = await prisma.syncedVideo.count({
      where: {
        channelId: channel.id,
        privacyStatus: 'private',
        OR: [{ publishAt: null }, { publishAt: { lte: now } }],
      },
    });

    // Contagem de drafts locais pendentes em batches
    const draftsCount = await prisma.videoDraft.count({
      where: {
        status: { in: ['PENDING', 'VALIDATING', 'UPLOADING'] },
      },
    });

    // Próximo vídeo a ser publicado (menor publishAt > now)
    const nextVideo = await prisma.syncedVideo.findFirst({
      where: {
        channelId: channel.id,
        privacyStatus: 'private',
        publishAt: {
          gt: now,
        },
      },
      orderBy: {
        publishAt: 'asc',
      },
    });

    // Último agendamento (maior publishAt)
    const lastVideo = await prisma.syncedVideo.findFirst({
      where: {
        channelId: channel.id,
        privacyStatus: 'private',
        publishAt: {
          gt: now,
        },
      },
      orderBy: {
        publishAt: 'desc',
      },
    });

    let nextThumbUrl: string | null = null;
    if (nextVideo?.thumbnails) {
      try {
        const parsed = JSON.parse(nextVideo.thumbnails);
        nextThumbUrl = parsed.medium?.url || parsed.default?.url || null;
      } catch {
        nextThumbUrl = null;
      }
    }

    return {
      channel: {
        id: channel.id,
        youtubeChannelId: channel.youtubeChannelId,
        title: channel.title,
        thumbnailUrl: channel.thumbnailUrl,
        uploadsPlaylistId: channel.uploadsPlaylistId,
      },
      counts: {
        published: publishedCount,
        scheduled: scheduledCount,
        private: privateCount,
        drafts: draftsCount,
      },
      nextScheduled: nextVideo && nextVideo.publishAt
        ? {
            videoId: nextVideo.youtubeVideoId,
            title: nextVideo.title,
            thumbnailUrl: nextThumbUrl,
            publishAt: nextVideo.publishAt.toISOString(),
          }
        : null,
      lastScheduled: lastVideo && lastVideo.publishAt
        ? {
            videoId: lastVideo.youtubeVideoId,
            title: lastVideo.title,
            publishAt: lastVideo.publishAt.toISOString(),
          }
        : null,
      lastSyncedAt: channel.syncState?.lastSyncedAt?.toISOString() || null,
    };
  }
}
