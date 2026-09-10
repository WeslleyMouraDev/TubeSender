import fs from 'node:fs';
import { google } from 'googleapis';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db/prisma.js';
import { OAuthService } from '../auth/oauth.service.js';
import { sseBroker } from '../../events/sse.js';
import { ThumbnailService } from '../youtube/thumbnail.service.js';
import { PlaylistService } from '../youtube/playlist.service.js';

export interface UploadExecutionOptions {
  draftId: string;
  onProgress?: (bytesSent: number, totalBytes: number, percentage: number) => void;
}

export class UploadService {
  /**
   * Valida integridade do arquivo local antes do upload
   */
  public static async validateFile(filePath: string): Promise<{ size: number }> {
    if (OAuthService.isMockMode() && !fs.existsSync(filePath)) {
      // Em modo mock se o caminho for simulado (ex: C:/Videos/...), permite tamanho padrão
      return { size: 10 * 1024 * 1024 };
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo não encontrado: "${filePath}". Selecione novamente o arquivo antes de continuar.`);
    }

    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      throw new Error(`O caminho especificado não é um arquivo: "${filePath}"`);
    }

    if (stat.size === 0) {
      throw new Error(`O arquivo de vídeo está vazio (0 bytes): "${filePath}"`);
    }

    return { size: stat.size };
  }

  /**
   * Executa upload de um único VideoDraft para o YouTube
   */
  public static async uploadVideo(options: UploadExecutionOptions) {
    const draft = await prisma.videoDraft.findUniqueOrThrow({
      where: { id: options.draftId },
      include: { batch: true },
    });

    // 1. Validação de estado inicial e arquivo
    await prisma.videoDraft.update({
      where: { id: draft.id },
      data: { status: 'VALIDATING', errorMessage: null },
    });
    sseBroker.emit({
      type: 'job.status',
      draftId: draft.id,
      batchId: draft.batchId,
      status: 'VALIDATING',
    });

    const fileMeta = await this.validateFile(draft.localPath);

    // 2. Prevenção de duplicatas: se já tem youtubeVideoId, não faz videos.insert!
    let youtubeVideoId = draft.youtubeVideoId;

    if (!youtubeVideoId) {
      // Inicia UPLOADING
      await prisma.videoDraft.update({
        where: { id: draft.id },
        data: { status: 'UPLOADING' },
      });
      sseBroker.emit({
        type: 'job.status',
        draftId: draft.id,
        batchId: draft.batchId,
        status: 'UPLOADING',
      });

      if (OAuthService.isMockMode()) {
        logger.info({ draftId: draft.id }, 'Simulando upload em modo mock');

        // Simula progresso SSE
        const totalBytes = fileMeta.size || 10485760;
        const steps = [0.25, 0.5, 0.75, 1.0];
        for (const step of steps) {
          const sent = Math.round(totalBytes * step);
          const pct = Math.round(step * 100);
          sseBroker.emit({
            type: 'upload.progress',
            draftId: draft.id,
            batchId: draft.batchId,
            bytesSent: sent,
            totalBytes,
            percentage: pct,
          });
          options.onProgress?.(sent, totalBytes, pct);
          await new Promise((resolve) => setTimeout(resolve, 30));
        }

        youtubeVideoId = `mock_yt_${draft.id.slice(-8)}`;

        // Gravação imediata do youtubeVideoId no banco
        await prisma.videoDraft.update({
          where: { id: draft.id },
          data: {
            youtubeVideoId,
            status: 'UPLOADED',
          },
        });
      } else {
        // Upload real via Google API
        const channel = await prisma.channel.findFirst({
          include: { oauthAccount: true },
        });
        if (!channel || !channel.oauthAccount) {
          throw new Error('Canal não conectado. Realize login antes de iniciar uploads.');
        }

        const oauth2Client = OAuthService.getOAuth2Client();
        oauth2Client.setCredentials({
          access_token: channel.oauthAccount.accessToken,
          refresh_token: channel.oauthAccount.refreshToken ?? undefined,
        });

        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

        const publishAtISO = draft.scheduledAt
          ? draft.scheduledAt.toISOString()
          : new Date(Date.now() + 3600 * 1000 * 24).toISOString();

        let tags: string[] = [];
        if (draft.customTags) {
          try {
            tags = JSON.parse(draft.customTags);
          } catch {
            tags = [];
          }
        }

        const insertResponse = await youtube.videos.insert({
          part: ['snippet', 'status'],
          requestBody: {
            snippet: {
              title: draft.title,
              description: draft.customDescription || '',
              tags,
            },
            status: {
              privacyStatus: 'private', // REGRA CRÍTICA: Sempre private para vídeos agendados
              publishAt: publishAtISO,
              selfDeclaredMadeForKids: false,
            },
          },
          media: {
            body: fs.createReadStream(draft.localPath),
          },
        });

        youtubeVideoId = insertResponse.data.id || null;
        if (!youtubeVideoId) {
          throw new Error('A API do YouTube não retornou um ID de vídeo após upload');
        }

        // Gravação imediata do ID
        await prisma.videoDraft.update({
          where: { id: draft.id },
          data: {
            youtubeVideoId,
            status: 'UPLOADED',
          },
        });
      }
    }

    // 3. Verificação de confirmação (VERIFYING)
    await prisma.videoDraft.update({
      where: { id: draft.id },
      data: { status: 'VERIFYING' },
    });
    sseBroker.emit({
      type: 'job.status',
      draftId: draft.id,
      batchId: draft.batchId,
      status: 'VERIFYING',
      youtubeVideoId,
    });

    if (!OAuthService.isMockMode()) {
      const channel = await prisma.channel.findFirst({
        include: { oauthAccount: true },
      });
      const oauth2Client = OAuthService.getOAuth2Client();
      oauth2Client.setCredentials({
        access_token: channel!.oauthAccount!.accessToken,
        refresh_token: channel!.oauthAccount!.refreshToken ?? undefined,
      });
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      const listRes = await youtube.videos.list({
        id: [youtubeVideoId],
        part: ['status'],
      });

      const item = listRes.data.items?.[0];
      if (!item || item.status?.privacyStatus !== 'private') {
        throw new Error(`Falha na verificação do vídeo ${youtubeVideoId}: status não é privado`);
      }
    }

    // 4. Pós-upload: Thumbnail e Playlist com isolamento de falhas (FASE 9)
    if (draft.thumbnailPath) {
      try {
        await ThumbnailService.setThumbnail(youtubeVideoId, draft.thumbnailPath);
      } catch (err: any) {
        logger.warn({ err: err.message, draftId: draft.id }, 'Falha ao aplicar thumbnail pós-upload (isolamento de falha)');
        await prisma.operationLog.create({
          data: {
            level: 'WARN',
            category: 'UPLOAD',
            message: `Falha ao aplicar thumbnail para "${draft.title}": ${err.message}`,
            metadata: JSON.stringify({ draftId: draft.id, youtubeVideoId, thumbnailPath: draft.thumbnailPath }),
          },
        });
      }
    }

    if (draft.playlistId) {
      try {
        await PlaylistService.addToPlaylist(youtubeVideoId, draft.playlistId);
      } catch (err: any) {
        logger.warn({ err: err.message, draftId: draft.id }, 'Falha ao adicionar à playlist pós-upload (isolamento de falha)');
        await prisma.operationLog.create({
          data: {
            level: 'WARN',
            category: 'UPLOAD',
            message: `Falha ao adicionar "${draft.title}" à playlist: ${err.message}`,
            metadata: JSON.stringify({ draftId: draft.id, youtubeVideoId, playlistId: draft.playlistId }),
          },
        });
      }
    }

    // 5. Marcação final como SCHEDULED
    const scheduledDraft = await prisma.videoDraft.update({
      where: { id: draft.id },
      data: {
        status: 'SCHEDULED',
        errorMessage: null,
      },
    });

    // 6. Registra no SyncedVideo local para atualização imediata do Dashboard e agendamentos futuros
    const activeChannel = await prisma.channel.findFirst({
      where: { oauthAccount: { isNot: null } },
    });
    if (activeChannel) {
      await prisma.syncedVideo.upsert({
        where: { youtubeVideoId },
        create: {
          channelId: activeChannel.id,
          youtubeVideoId,
          title: draft.title,
          description: draft.customDescription,
          privacyStatus: 'private',
          publishAt: draft.scheduledAt,
          tags: draft.customTags,
        },
        update: {
          title: draft.title,
          description: draft.customDescription,
          privacyStatus: 'private',
          publishAt: draft.scheduledAt,
          tags: draft.customTags,
        },
      });
    }

    sseBroker.emit({
      type: 'job.status',
      draftId: draft.id,
      batchId: draft.batchId,
      status: 'SCHEDULED',
      youtubeVideoId,
    });

    await prisma.operationLog.create({
      data: {
        level: 'INFO',
        category: 'UPLOAD',
        message: `Vídeo "${draft.title}" agendado com sucesso no YouTube`,
        metadata: JSON.stringify({ draftId: draft.id, youtubeVideoId }),
      },
    });

    return scheduledDraft;
  }
}
