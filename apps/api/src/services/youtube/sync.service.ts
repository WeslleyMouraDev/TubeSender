import { logger } from '../../config/logger.js';
import { prisma } from '../../db/prisma.js';
import { OAuthService } from '../auth/oauth.service.js';

export interface SyncStats {
  total: number;
  published: number;
  scheduled: number;
  private: number;
}

export class YouTubeSyncService {
  /**
   * Sincroniza os vídeos reais do canal do YouTube com o SQLite local.
   * Consulta a playlist de uploads do canal com paginação real via nextPageToken.
   */
  public static async syncChannel(): Promise<SyncStats> {
    const { youtube, channel } = await OAuthService.getAuthenticatedYouTubeClient();

    // Atualiza estado de sincronização para SYNCING
    await prisma.syncState.upsert({
      where: { channelId: channel.id },
      create: {
        channelId: channel.id,
        status: 'SYNCING',
      },
      update: {
        status: 'SYNCING',
        errorMessage: null,
      },
    });

    try {
      let uploadsPlaylistId = channel.uploadsPlaylistId;
      if (!uploadsPlaylistId) {
        const chRes = await youtube.channels.list({
          part: ['contentDetails'],
          mine: true,
        });
        uploadsPlaylistId = chRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
        if (uploadsPlaylistId) {
          await prisma.channel.update({
            where: { id: channel.id },
            data: { uploadsPlaylistId },
          });
        }
      }

      if (!uploadsPlaylistId) {
        throw new Error('Não foi possível identificar a playlist de uploads do canal no YouTube');
      }

      // 1. Percorre a playlist de uploads completa utilizando paginação por nextPageToken
      const allVideoIds: string[] = [];
      let pageToken: string | undefined = undefined;

      while (true) {
        const playlistRes: any = await youtube.playlistItems.list({
          part: ['contentDetails'],
          playlistId: uploadsPlaylistId,
          maxResults: 50,
          pageToken,
        });

        const items = playlistRes.data.items || [];
        for (const item of items) {
          const videoId = item.contentDetails?.videoId;
          if (videoId) {
            allVideoIds.push(videoId);
          }
        }

        pageToken = playlistRes.data.nextPageToken || undefined;
        if (!pageToken) {
          break;
        }
      }

      // 2. Busca os detalhes completos de cada vídeo em lotes de 50
      let publishedCount = 0;
      let scheduledCount = 0;
      let privateCount = 0;
      const now = new Date();

      for (let i = 0; i < allVideoIds.length; i += 50) {
        const batchIds = allVideoIds.slice(i, i + 50);
        const videosRes = await youtube.videos.list({
          part: ['snippet', 'status', 'contentDetails'],
          id: batchIds,
        });

        const videoItems = videosRes.data.items || [];
        for (const v of videoItems) {
          const vId = v.id;
          if (!vId) continue;

          const privacyStatus = v.status?.privacyStatus || 'private';
          const publishAt = v.status?.publishAt ? new Date(v.status.publishAt) : null;
          const publishedAt = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : null;

          // Classificação estrita conforme SPEC:
          // Agendado: private com publishAt futuro
          // Publicado: public
          // Privado: private sem publishAt
          if (privacyStatus === 'private' && publishAt && publishAt > now) {
            scheduledCount++;
          } else if (privacyStatus === 'public') {
            publishedCount++;
          } else if (privacyStatus === 'private') {
            privateCount++;
          }

          await prisma.syncedVideo.upsert({
            where: { youtubeVideoId: vId },
            create: {
              channelId: channel.id,
              youtubeVideoId: vId,
              title: v.snippet?.title || 'Sem título',
              description: v.snippet?.description,
              privacyStatus,
              publishAt,
              publishedAt,
              thumbnails: v.snippet?.thumbnails ? JSON.stringify(v.snippet.thumbnails) : null,
              tags: v.snippet?.tags ? JSON.stringify(v.snippet.tags) : null,
              categoryId: v.snippet?.categoryId,
            },
            update: {
              title: v.snippet?.title || 'Sem título',
              description: v.snippet?.description,
              privacyStatus,
              publishAt,
              publishedAt,
              thumbnails: v.snippet?.thumbnails ? JSON.stringify(v.snippet.thumbnails) : null,
              tags: v.snippet?.tags ? JSON.stringify(v.snippet.tags) : null,
              categoryId: v.snippet?.categoryId,
            },
          });
        }
      }

      await prisma.syncState.update({
        where: { channelId: channel.id },
        data: {
          status: 'IDLE',
          lastSyncedAt: new Date(),
          errorMessage: null,
        },
      });

      const stats: SyncStats = {
        total: allVideoIds.length,
        published: publishedCount,
        scheduled: scheduledCount,
        private: privateCount,
      };

      await prisma.operationLog.create({
        data: {
          level: 'INFO',
          category: 'SYNC',
          message: `Sincronização com o YouTube concluída: ${stats.total} vídeos`,
          metadata: JSON.stringify(stats),
        },
      });

      return stats;
    } catch (err: any) {
      await prisma.syncState.update({
        where: { channelId: channel.id },
        data: {
          status: 'ERROR',
          errorMessage: err.message || 'Erro desconhecido durante sincronização com o YouTube',
        },
      });

      await prisma.operationLog.create({
        data: {
          level: 'ERROR',
          category: 'SYNC',
          message: `Falha na sincronização com o YouTube: ${err.message}`,
        },
      });

      throw err;
    }
  }
}
