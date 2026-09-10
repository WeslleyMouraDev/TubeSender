import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp, type AppInstance } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { ProfileService } from '../src/services/profiles/profile.service.js';

describe('History, Profiles, Diagnostics and Logs (FASE 7, 8, 10)', () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.operationLog.deleteMany();
    await prisma.uploadProfile.deleteMany();
    await prisma.syncedVideo.deleteMany();
    await prisma.channel.deleteMany();
  });

  // FASE 7 — Histórico de Vídeos
  it('GET /api/videos deve listar e filtrar vídeos sincronizados', async () => {
    const channel = await prisma.channel.create({
      data: {
        youtubeChannelId: 'UC_TEST_HIST',
        title: 'Canal de Teste',
      },
    });

    const now = new Date();
    await prisma.syncedVideo.createMany({
      data: [
        {
          channelId: channel.id,
          youtubeVideoId: 'v_pub_1',
          title: 'Vídeo Público de Inteligência Artificial',
          privacyStatus: 'public',
        },
        {
          channelId: channel.id,
          youtubeVideoId: 'v_sched_1',
          title: 'Vídeo Agendado de Automação',
          privacyStatus: 'private',
          publishAt: new Date(now.getTime() + 1000 * 3600 * 48),
        },
      ],
    });

    // 1. Busca todos
    const allRes = await app.inject({
      method: 'GET',
      url: '/api/videos?status=all',
    });
    expect(allRes.statusCode).toBe(200);
    expect(JSON.parse(allRes.body).total).toBe(2);

    // 2. Filtra por status 'scheduled'
    const schedRes = await app.inject({
      method: 'GET',
      url: '/api/videos?status=scheduled',
    });
    expect(schedRes.statusCode).toBe(200);
    const schedBody = JSON.parse(schedRes.body);
    expect(schedBody.total).toBe(1);
    expect(schedBody.items[0].youtubeVideoId).toBe('v_sched_1');

    // 3. Busca por termo
    const searchRes = await app.inject({
      method: 'GET',
      url: '/api/videos?search=Automação',
    });
    expect(searchRes.statusCode).toBe(200);
    expect(JSON.parse(searchRes.body).total).toBe(1);
  });

  // FASE 8 — Padrões de Upload e Herança de Metadados
  it('ProfileService deve gerenciar perfis, herança de tags e renderização de descrição', async () => {
    // Teste de renderização de template
    const template = '{{descricao_video}}\n\n---\nInscreva-se: {{descricao_padrao}}';
    const rendered = ProfileService.renderDescription(
      template,
      'Hoje falamos de LLMs.',
      'https://youtube.com/@meucanal'
    );
    expect(rendered).toContain('Hoje falamos de LLMs.');
    expect(rendered).toContain('https://youtube.com/@meucanal');

    // Teste de mesclagem e deduplicação de tags
    const mergedTags = ProfileService.mergeTags(
      ['ia', 'tech', 'tutorial'],
      ['deeplearning', 'ia'],
      ['tutorial', '2026']
    );
    expect(mergedTags).toEqual(['ia', 'tech', 'tutorial', 'deeplearning', '2026']);

    // Criação de perfil via endpoint
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/profiles',
      payload: {
        name: 'Padrão Shorts IA',
        isDefault: true,
        defaultDescription: 'Siga para mais dicas de IA.',
        defaultTags: ['ia', 'shorts'],
        defaultLanguage: 'pt',
        madeForKids: false,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createdProfile = JSON.parse(createRes.body);
    expect(createdProfile.name).toBe('Padrão Shorts IA');
    expect(createdProfile.isDefault).toBe(true);

    // Listagem
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/profiles',
    });
    expect(listRes.statusCode).toBe(200);
    expect(JSON.parse(listRes.body)).toHaveLength(1);
  });

  // FASE 10 — Diagnósticos e Logs Estruturados
  it('GET /api/diagnostics/run deve executar e responder status 200', async () => {
    const diagRes = await app.inject({
      method: 'GET',
      url: '/api/diagnostics/run',
    });

    expect(diagRes.statusCode).toBe(200);
    const body = JSON.parse(diagRes.body);
    expect(body.results).toBeInstanceOf(Array);
    expect(body.results.length).toBeGreaterThanOrEqual(4);
    expect(body.results.some((r: any) => r.name.includes('SQLite'))).toBe(true);
  });

  it('GET /api/logs deve retornar logs estruturados e sanitizados', async () => {
    await prisma.operationLog.create({
      data: {
        level: 'INFO',
        category: 'SYSTEM',
        message: 'Teste de auditoria',
        metadata: JSON.stringify({ accessToken: 'secret_token_123', clientSecret: 'sensitive_pass' }),
      },
    });

    const logsRes = await app.inject({
      method: 'GET',
      url: '/api/logs',
    });

    expect(logsRes.statusCode).toBe(200);
    const body = JSON.parse(logsRes.body);
    expect(body.items.length).toBe(1);
    expect(body.items[0].metadata.accessToken).toBe('***');
    expect(body.items[0].metadata.clientSecret).toBe('***');
  });
});
