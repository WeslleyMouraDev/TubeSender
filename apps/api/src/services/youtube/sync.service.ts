import { google } from 'googleapis';
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
  public static async syncChannel(): Promise<SyncStats> {
    const channel = await prisma.channel.findFirst({
      include: {
        oauthAccount: true,
        syncState: true,
      },
    });

    if (!channel) {
      throw new Error('Nenhum canal do YouTube conectado para sincronização');
    }

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
      if (OAuthService.isMockMode()) {
        logger.info({ channelId: channel.id }, 'Executando sincronização em modo mock');
        const stats = await this.syncMockVideos(channel.id);

        await prisma.syncState.update({
          where: { channelId: channel.id },
          data: {
            status: 'IDLE',
            lastSyncedAt: new Date(),
            errorMessage: null,
          },
        });

        await prisma.operationLog.create({
          data: {
            level: 'INFO',
            category: 'SYNC',
            message: `Sincronização concluída (Mock): ${stats.total} vídeos`,
            metadata: JSON.stringify(stats),
          },
        });

        return stats;
      }

      // Fluxo real com YouTube API
      const oauth2Client = OAuthService.getOAuth2Client();
      oauth2Client.setCredentials({
        access_token: channel.oauthAccount?.accessToken,
        refresh_token: channel.oauthAccount?.refreshToken ?? undefined,
      });

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

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
        throw new Error('Playlist de uploads não encontrada para o canal');
      }

      let pageToken: string | undefined = undefined;
      const allVideoIds: string[] = [];

      do {
        const playlistRes: any = await youtube.playlistItems.list({
          playlistId: uploadsPlaylistId,
          part: ['contentDetails'],
          maxResults: 50,
          pageToken,
        });

        const items = playlistRes.data.items || [];
        for (const item of items) {
          if (item.contentDetails?.videoId) {
            allVideoIds.push(item.contentDetails.videoId);
          }
        }

        pageToken = playlistRes.data.nextPageToken || undefined;
      } while (pageToken);

      let publishedCount = 0;
      let scheduledCount = 0;
      let privateCount = 0;

      // Pega os detalhes dos vídeos em blocos de até 50
      const chunkSize = 50;
      for (let i = 0; i < allVideoIds.length; i += chunkSize) {
        const chunk = allVideoIds.slice(i, i + chunkSize);
        const videosRes = await youtube.videos.list({
          id: chunk,
          part: ['snippet', 'status'],
        });

        const videoItems = videosRes.data.items || [];
        for (const v of videoItems) {
          const vId = v.id!;
          const privacyStatus = v.status?.privacyStatus || 'private';
          const publishAtStr = v.status?.publishAt;
          const publishAt = publishAtStr ? new Date(publishAtStr) : null;
          const publishedAtStr = v.snippet?.publishedAt;
          const publishedAt = publishedAtStr ? new Date(publishedAtStr) : null;

          const now = new Date();
          const isScheduled = privacyStatus === 'private' && publishAt !== null && publishAt > now;
          if (isScheduled) {
            scheduledCount++;
          } else if (privacyStatus === 'public') {
            publishedCount++;
          } else {
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
          message: `Sincronização concluída: ${stats.total} vídeos`,
          metadata: JSON.stringify(stats),
        },
      });

      return stats;
    } catch (err: any) {
      await prisma.syncState.update({
        where: { channelId: channel.id },
        data: {
          status: 'ERROR',
          errorMessage: err.message || 'Erro desconhecido durante sincronização',
        },
      });

      await prisma.operationLog.create({
        data: {
          level: 'ERROR',
          category: 'SYNC',
          message: `Falha na sincronização: ${err.message}`,
        },
      });

      throw err;
    }
  }

  private static async syncMockVideos(channelId: string): Promise<SyncStats> {
    const now = new Date();
    const mockVideos = [
      {
        youtubeVideoId: 'mock_vid_pub_1',
        title: '01 - O que é Inteligência Artificial Geral (AGI)',
        description: 'Primeiro vídeo da série sobre evolução de Inteligência Artificial.',
        privacyStatus: 'public',
        publishAt: null,
        publishedAt: new Date(now.getTime() - 1000 * 3600 * 48),
        thumbnails: JSON.stringify({
          medium: { url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=320&auto=format&fit=crop&q=80' },
        }),
        tags: JSON.stringify(['ia', 'agi', 'tecnologia']),
      },
      {
        youtubeVideoId: 'mock_vid_pub_2',
        title: '02 - Como Funcionam os Modelos LLM',
        description: 'Explicando transformers, atenção e embeddings de forma simples.',
        privacyStatus: 'public',
        publishAt: null,
        publishedAt: new Date(now.getTime() - 1000 * 3600 * 24),
        thumbnails: JSON.stringify({
          medium: { url: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=320&auto=format&fit=crop&q=80' },
        }),
        tags: JSON.stringify(['ia', 'llm', 'deeplearning']),
      },
      {
        youtubeVideoId: 'mock_vid_sched_1',
        title: '03 - Agentes Autônomos na Prática',
        description: 'Demonstração de execução com subagentes e ferramentas locais.',
        privacyStatus: 'private',
        publishAt: new Date(now.getTime() + 1000 * 3600 * 20), // 20h no futuro (amanhã)
        publishedAt: null,
        thumbnails: JSON.stringify({
          medium: { url: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=320&auto=format&fit=crop&q=80' },
        }),
        tags: JSON.stringify(['agentes', 'ia', 'automacao']),
      },
      {
        youtubeVideoId: 'mock_vid_sched_2',
        title: '04 - O Futuro do Trabalho com IA',
        description: 'Análise de tendências de produtividade e novas profissões.',
        privacyStatus: 'private',
        publishAt: new Date(now.getTime() + 1000 * 3600 * 44), // 44h no futuro (depois de amanhã)
        publishedAt: null,
        thumbnails: JSON.stringify({
          medium: { url: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=320&auto=format&fit=crop&q=80' },
        }),
        tags: JSON.stringify(['futuro', 'carreira', 'tecnologia']),
      },
    ];

    for (const v of mockVideos) {
      await prisma.syncedVideo.upsert({
        where: { youtubeVideoId: v.youtubeVideoId },
        create: {
          channelId,
          ...v,
        },
        update: {
          ...v,
        },
      });
    }

    return {
      total: mockVideos.length,
      published: 2,
      scheduled: 2,
      private: 0,
    };
  }
}
