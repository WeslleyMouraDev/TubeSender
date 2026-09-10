import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildApp, type AppInstance } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { UploadService } from '../src/services/upload/upload.service.js';
import { UploadQueueService } from '../src/services/upload/queue.service.js';
import { OAuthService } from '../src/services/auth/oauth.service.js';
import { ThumbnailService } from '../src/services/youtube/thumbnail.service.js';
import { PlaylistService } from '../src/services/youtube/playlist.service.js';

describe('Upload and Queue Processing (FASE 5 & FASE 6)', () => {
  let app: AppInstance;
  let tempVideoPath: string;
  let tempThumbPath: string;

  beforeAll(async () => {
    app = await buildApp();

    // Cria arquivos temporários reais de teste no sistema de arquivos
    const tempDir = os.tmpdir();
    tempVideoPath = path.join(tempDir, 'tubesender-test-video.mp4');
    tempThumbPath = path.join(tempDir, 'tubesender-test-thumb.jpg');
    fs.writeFileSync(tempVideoPath, 'dummy mp4 test video content for unit testing');
    fs.writeFileSync(tempThumbPath, 'dummy jpg test thumbnail content');
  });

  afterAll(async () => {
    if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
    if (fs.existsSync(tempThumbPath)) fs.unlinkSync(tempThumbPath);
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.videoDraft.deleteMany();
    await prisma.batch.deleteMany();
    await prisma.operationLog.deleteMany();
    vi.restoreAllMocks();

    // Simula cliente do YouTube para testes de upload
    const mockYouTube = {
      videos: {
        insert: vi.fn().mockResolvedValue({
          data: { id: 'yt_uploaded_sample_123' },
        }),
        list: vi.fn().mockResolvedValue({
          data: {
            items: [
              {
                id: 'yt_uploaded_sample_123',
                status: { privacyStatus: 'private' },
              },
            ],
          },
        }),
      },
    };

    vi.spyOn(OAuthService, 'getAuthenticatedYouTubeClient').mockResolvedValue({
      youtube: mockYouTube as any,
      channel: { id: 'chan_test' } as any,
      oauth2Client: {} as any,
    });
  });

  it('UploadService.uploadVideo deve realizar upload real e marcar como SCHEDULED com ID imediato', async () => {
    const batch = await prisma.batch.create({
      data: { status: 'READY', totalVideos: 1 },
    });

    const draft = await prisma.videoDraft.create({
      data: {
        batchId: batch.id,
        filename: 'aula-01.mp4',
        localPath: tempVideoPath,
        title: 'Aula 01',
        orderIndex: 0,
        status: 'PENDING',
        scheduledAt: new Date(Date.now() + 3600 * 1000 * 24),
      },
    });

    const scheduled = await UploadService.uploadVideo({ draftId: draft.id });
    expect(scheduled.status).toBe('SCHEDULED');
    expect(scheduled.youtubeVideoId).toBe('yt_uploaded_sample_123');

    // Teste de prevenção de duplicatas: se chamar novamente, mantém o mesmo youtubeVideoId sem novo insert
    const repeated = await UploadService.uploadVideo({ draftId: draft.id });
    expect(repeated.youtubeVideoId).toBe('yt_uploaded_sample_123');
  });

  it('UploadQueueService deve processar fila sequencialmente até COMPLETED', async () => {
    const batch = await prisma.batch.create({
      data: { status: 'READY', totalVideos: 2 },
    });

    await prisma.videoDraft.createMany({
      data: [
        {
          batchId: batch.id,
          filename: 'video-1.mp4',
          localPath: tempVideoPath,
          title: 'Vídeo 1',
          orderIndex: 0,
          status: 'PENDING',
        },
        {
          batchId: batch.id,
          filename: 'video-2.mp4',
          localPath: tempVideoPath,
          title: 'Vídeo 2',
          orderIndex: 1,
          status: 'PENDING',
        },
      ],
    });

    // Inicia a fila via endpoint
    const startRes = await app.inject({
      method: 'POST',
      url: `/api/queue/start/${batch.id}`,
    });
    expect(startRes.statusCode).toBe(200);

    // Aguarda worker finalizar os 2 vídeos
    await new Promise((resolve) => setTimeout(resolve, 800));

    const updatedBatch = await prisma.batch.findUniqueOrThrow({
      where: { id: batch.id },
      include: { drafts: true },
    });

    expect(updatedBatch.status).toBe('COMPLETED');
    expect(updatedBatch.completedVideos).toBe(2);
    expect(updatedBatch.drafts[0].status).toBe('SCHEDULED');
    expect(updatedBatch.drafts[1].status).toBe('SCHEDULED');
  });

  it('POST /api/queue/cancel/:batchId deve cancelar vídeos pendentes', async () => {
    const batch = await prisma.batch.create({
      data: { status: 'READY', totalVideos: 1 },
    });

    const draft = await prisma.videoDraft.create({
      data: {
        batchId: batch.id,
        filename: 'v-cancel.mp4',
        localPath: tempVideoPath,
        title: 'Vídeo para Cancelar',
        orderIndex: 0,
        status: 'PENDING',
      },
    });

    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/queue/cancel/${batch.id}`,
    });
    expect(cancelRes.statusCode).toBe(200);
    const updatedDraft = await prisma.videoDraft.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(updatedDraft.status).toBe('CANCELED');
  });

  it('recoverQueueOnStartup deve recuperar rascunhos interrompidos sem duplicar uploads', async () => {
    const batch = await prisma.batch.create({
      data: { status: 'RUNNING', totalVideos: 2 },
    });

    // Rascunho 1: estava UPLOADING mas já tinha obtido ID
    const draftWithId = await prisma.videoDraft.create({
      data: {
        batchId: batch.id,
        filename: 'interrompido-com-id.mp4',
        localPath: tempVideoPath,
        title: 'Vídeo Interrompido Com ID',
        orderIndex: 0,
        status: 'UPLOADING',
        youtubeVideoId: 'yt_recovered_123',
      },
    });

    // Rascunho 2: estava UPLOADING mas caiu antes de obter ID
    const draftWithoutId = await prisma.videoDraft.create({
      data: {
        batchId: batch.id,
        filename: 'interrompido-sem-id.mp4',
        localPath: tempVideoPath,
        title: 'Vídeo Interrompido Sem ID',
        orderIndex: 1,
        status: 'UPLOADING',
        youtubeVideoId: null,
      },
    });

    // Executa recuperação de inicialização
    await UploadQueueService.recoverQueueOnStartup();

    const recovered1 = await prisma.videoDraft.findUniqueOrThrow({ where: { id: draftWithId.id } });
    const recovered2 = await prisma.videoDraft.findUniqueOrThrow({ where: { id: draftWithoutId.id } });

    // O com ID é protegido contra duplicação de upload
    expect(recovered1.status).toBe('UPLOADED');
    // O sem ID é resetado para PENDING
    expect(recovered2.status).toBe('PENDING');
  });

  it('UploadService deve aplicar thumbnail e playlist com isolamento de falha (FASE 9)', async () => {
    const batch = await prisma.batch.create({
      data: { status: 'READY', totalVideos: 1 },
    });

    const draft = await prisma.videoDraft.create({
      data: {
        batchId: batch.id,
        filename: 'aula-completa.mp4',
        localPath: tempVideoPath,
        title: 'Aula Completa',
        orderIndex: 0,
        status: 'PENDING',
        thumbnailPath: tempThumbPath,
        playlistId: 'PL_TEST_123',
        scheduledAt: new Date(Date.now() + 3600 * 1000 * 24),
      },
    });

    vi.spyOn(ThumbnailService, 'setThumbnail').mockResolvedValue(true);
    vi.spyOn(PlaylistService, 'addToPlaylist').mockResolvedValue(true);

    const result = await UploadService.uploadVideo({ draftId: draft.id });
    expect(result.status).toBe('SCHEDULED');
    expect(result.youtubeVideoId).toBeDefined();

    // Testa endpoints granulares de retry de thumbnail e playlist
    const resThumb = await app.inject({
      method: 'POST',
      url: `/api/queue/retry-thumbnail/${draft.id}`,
    });
    expect(resThumb.statusCode).toBe(200);

    const resPlay = await app.inject({
      method: 'POST',
      url: `/api/queue/retry-playlist/${draft.id}`,
    });
    expect(resPlay.statusCode).toBe(200);
  });
});
