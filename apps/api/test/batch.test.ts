import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp, type AppInstance } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

describe('Batch and VideoDraft Management (FASE 4)', () => {
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
  });

  it('GET /api/batches/current deve retornar um lote com status DRAFT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/batches/current',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('DRAFT');
    expect(body.drafts).toEqual([]);
  });

  it('POST /api/batches/:id/drafts deve adicionar vídeos e derivar títulos amigáveis', async () => {
    const currentRes = await app.inject({
      method: 'GET',
      url: '/api/batches/current',
    });
    const batchId = JSON.parse(currentRes.body).id;

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/batches/${batchId}/drafts`,
      payload: {
        files: [
          { filename: '01 - O que e AGI.mp4', localPath: 'C:/Videos/01.mp4', fileSize: 1048576 },
          { filename: '02 - Como Usar LLM.mp4', localPath: 'C:/Videos/02.mp4', fileSize: 2097152 },
        ],
      },
    });

    expect(addRes.statusCode).toBe(200);
    const updated = JSON.parse(addRes.body);
    expect(updated.totalVideos).toBe(2);
    expect(updated.drafts).toHaveLength(2);
    expect(updated.drafts[0].title).toBe('01 - O que e AGI');
    expect(updated.drafts[0].orderIndex).toBe(0);
    expect(updated.drafts[1].title).toBe('02 - Como Usar LLM');
    expect(updated.drafts[1].orderIndex).toBe(1);
  });

  it('POST /api/batches/:id/reorder deve reordenar os vídeos no lote', async () => {
    const currentRes = await app.inject({
      method: 'GET',
      url: '/api/batches/current',
    });
    const batchId = JSON.parse(currentRes.body).id;

    const addRes = await app.inject({
      method: 'POST',
      url: `/api/batches/${batchId}/drafts`,
      payload: {
        files: [
          { filename: 'video-a.mp4', localPath: 'C:/v-a.mp4' },
          { filename: 'video-b.mp4', localPath: 'C:/v-b.mp4' },
        ],
      },
    });
    const drafts = JSON.parse(addRes.body).drafts;
    const reversedIds = [drafts[1].id, drafts[0].id];

    const reorderRes = await app.inject({
      method: 'POST',
      url: `/api/batches/${batchId}/reorder`,
      payload: {
        draftIds: reversedIds,
      },
    });

    expect(reorderRes.statusCode).toBe(200);
    const reordered = JSON.parse(reorderRes.body);
    expect(reordered.drafts[0].id).toBe(drafts[1].id);
    expect(reordered.drafts[0].orderIndex).toBe(0);
    expect(reordered.drafts[1].id).toBe(drafts[0].id);
    expect(reordered.drafts[1].orderIndex).toBe(1);
  });

  it('POST /api/batches/:id/apply-schedule deve calcular e persistir datas para os drafts', async () => {
    const currentRes = await app.inject({
      method: 'GET',
      url: '/api/batches/current',
    });
    const batchId = JSON.parse(currentRes.body).id;

    await app.inject({
      method: 'POST',
      url: `/api/batches/${batchId}/drafts`,
      payload: {
        files: [
          { filename: 'video-1.mp4', localPath: 'C:/v-1.mp4' },
          { filename: 'video-2.mp4', localPath: 'C:/v-2.mp4' },
        ],
      },
    });

    const applyRes = await app.inject({
      method: 'POST',
      url: `/api/batches/${batchId}/apply-schedule`,
      payload: {
        slots: ['12:00', '21:00'],
        timezone: 'America/Recife',
        minimumLeadMinutes: 10,
        useLastScheduled: false,
      },
    });

    expect(applyRes.statusCode).toBe(200);
    const body = JSON.parse(applyRes.body);
    expect(body.status).toBe('READY');
    expect(body.drafts[0].scheduledAt).toBeDefined();
    expect(body.drafts[1].scheduledAt).toBeDefined();
    expect(new Date(body.drafts[1].scheduledAt) > new Date(body.drafts[0].scheduledAt)).toBe(true);
  });

  it('POST /api/batches/:id/apply-profile deve aplicar metadados do perfil aos drafts', async () => {
    const profile = await prisma.uploadProfile.create({
      data: {
        name: 'Perfil Padrão Teste',
        defaultDescription: 'Descrição padrão do canal.\nInscreva-se!',
        defaultTags: JSON.stringify(['ia', 'automacao']),
        playlistId: 'PL_DEFAULT_999',
      },
    });

    const currentRes = await app.inject({
      method: 'GET',
      url: '/api/batches/current',
    });
    const batchId = JSON.parse(currentRes.body).id;

    await app.inject({
      method: 'POST',
      url: `/api/batches/${batchId}/drafts`,
      payload: {
        files: [{ filename: 'aula-especial.mp4', localPath: 'C:/aula.mp4' }],
      },
    });

    const applyProfRes = await app.inject({
      method: 'POST',
      url: `/api/batches/${batchId}/apply-profile`,
      payload: {
        profileId: profile.id,
      },
    });

    expect(applyProfRes.statusCode).toBe(200);
    const body = JSON.parse(applyProfRes.body);
    expect(body.drafts[0].customDescription).toContain('Descrição padrão do canal.');
    expect(body.drafts[0].customTags).toContain('ia');
    expect(body.drafts[0].customTags).toContain('automacao');
    expect(body.drafts[0].playlistId).toBe('PL_DEFAULT_999');
  });
});
