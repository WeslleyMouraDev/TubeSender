import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp, type AppInstance } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { UploadService } from '../src/services/upload/upload.service.js';
import { UploadQueueService } from '../src/services/upload/queue.service.js';

describe('Upload and Queue Processing (FASE 5 & FASE 6)', () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.videoDraft.deleteMany();
    await prisma.batch.deleteMany();
    await prisma.operationLog.deleteMany();
  });

  it('UploadService.uploadVideo deve realizar upload mock e marcar como SCHEDULED com ID imediato', async () => {
    const batch = await prisma.batch.create({
      data: { status: 'READY', totalVideos: 1 },
    });

    const draft = await prisma.videoDraft.create({
      data: {
        batchId: batch.id,
        filename: 'aula-01.mp4',
        localPath: 'C:/Videos/aula-01.mp4',
        title: 'Aula 01',
        orderIndex: 0,
        status: 'PENDING',
        scheduledAt: new Date(Date.now() + 3600 * 1000 * 24),
      },
    });

    const scheduled = await UploadService.uploadVideo({ draftId: draft.id });
    expect(scheduled.status).toBe('SCHEDULED');
    expect(scheduled.youtubeVideoId).toBeDefined();
    expect(scheduled.youtubeVideoId).toContain('mock_yt_');

    // Teste de prevenção de duplicatas: se chamar novamente, mantém o mesmo youtubeVideoId
    const originalId = scheduled.youtubeVideoId;
    const repeated = await UploadService.uploadVideo({ draftId: draft.id });
    expect(repeated.youtubeVideoId).toBe(originalId);
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
          localPath: 'C:/Videos/v1.mp4',
          title: 'Vídeo 1',
          orderIndex: 0,
          status: 'PENDING',
        },
        {
          batchId: batch.id,
          filename: 'video-2.mp4',
          localPath: 'C:/Videos/v2.mp4',
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

    // Aguarda worker finalizar os 2 vídeos mock
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
        localPath: 'C:/v.mp4',
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
        localPath: 'C:/Videos/vid1.mp4',
        title: 'Vídeo Interrompido Com ID',
        orderIndex: 0,
        status: 'UPLOADING',
        youtubeVideoId: 'mock_yt_recovered_123',
      },
    });

    // Rascunho 2: estava UPLOADING mas caiu antes de obter ID
    const draftWithoutId = await prisma.videoDraft.create({
      data: {
        batchId: batch.id,
        filename: 'interrompido-sem-id.mp4',
        localPath: 'C:/Videos/vid2.mp4',
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
        localPath: 'C:/Videos/aula-completa.mp4',
        title: 'Aula Completa',
        orderIndex: 0,
        status: 'PENDING',
        thumbnailPath: 'C:/Images/thumb.jpg',
        playlistId: 'PL_TEST_123',
        scheduledAt: new Date(Date.now() + 3600 * 1000 * 24),
      },
    });

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
