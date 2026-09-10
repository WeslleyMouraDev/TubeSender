import fs from 'node:fs';
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
   * Valida integridade e existência física do arquivo local antes do upload.
   */
  public static async validateFile(filePath: string): Promise<{ size: number }> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Arquivo não encontrado no disco: "${filePath}". Selecione novamente o arquivo antes de continuar.`);
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
   * Executa upload real de um único VideoDraft para o YouTube Data API v3.
   */
  public static async uploadVideo(options: UploadExecutionOptions) {
    const draft = await prisma.videoDraft.findUniqueOrThrow({
      where: { id: options.draftId },
      include: { batch: true },
    });

    // 1. Validação de estado inicial e arquivo físico
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

    // 2. Prevenção estrita de duplicatas: se já tem youtubeVideoId, NUNCA repete videos.insert!
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

      // Obtém cliente autenticado real com token atualizado
      const { youtube } = await OAuthService.getAuthenticatedYouTubeClient();

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

      // Stream de leitura com acompanhamento de progresso real
      const totalBytes = fileMeta.size;
      let uploadedBytes = 0;
      const fileStream = fs.createReadStream(draft.localPath);

      fileStream.on('data', (chunk) => {
        uploadedBytes += chunk.length;
        const percentage = Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));
        sseBroker.emit({
          type: 'upload.progress',
          draftId: draft.id,
          batchId: draft.batchId,
          bytesSent: uploadedBytes,
          totalBytes,
          percentage,
        });
        options.onProgress?.(uploadedBytes, totalBytes, percentage);
      });

      // Chamada real à API do YouTube
      const insertResponse = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: draft.title,
            description: draft.customDescription || '',
            tags,
          },
          status: {
            privacyStatus: 'private', // REGRA CRÍTICA DA SPEC: Sempre private com publishAt para vídeos agendados
            publishAt: publishAtISO,
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: fileStream,
        },
      });

      youtubeVideoId = insertResponse.data.id || null;
      if (!youtubeVideoId) {
        throw new Error('A API do YouTube concluiu o upload mas não retornou um ID de vídeo.');
      }

      // Gravação imediata do ID recebido no banco operacional
      await prisma.videoDraft.update({
        where: { id: draft.id },
        data: {
          youtubeVideoId,
          status: 'UPLOADED',
        },
      });
    }

    // 3. Verificação de confirmação no YouTube (VERIFYING)
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

    const { youtube: verifyYouTube } = await OAuthService.getAuthenticatedYouTubeClient();
    const listRes = await verifyYouTube.videos.list({
      id: [youtubeVideoId],
      part: ['status'],
    });

    const item = listRes.data.items?.[0];
    if (!item || item.status?.privacyStatus !== 'private') {
      throw new Error(`Falha na verificação do vídeo ${youtubeVideoId} no YouTube: status não é privado ou vídeo não encontrado`);
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
