import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DashboardDataSchema } from '@tubesender/shared';
import { buildApp, type AppInstance } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { OAuthService } from '../src/services/auth/oauth.service.js';

describe('YouTube Sync and Dashboard (FASE 2)', () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.syncedVideo.deleteMany();
    await prisma.syncState.deleteMany();
    await prisma.oAuthAccount.deleteMany();
    await prisma.channel.deleteMany();
  });

  it('POST /api/channel/sync deve retornar erro se nenhum canal estiver conectado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/channel/sync',
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Sync Failed');
  });

  it('POST /api/channel/sync e GET /api/dashboard devem sincronizar e exibir métricas corretas', async () => {
    // 1. Conecta o canal primeiro
    await OAuthService.handleCallback('mock_code_for_sync');

    // 2. Executa a sincronização
    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/channel/sync',
    });

    expect(syncRes.statusCode).toBe(200);
    const syncBody = JSON.parse(syncRes.body);
    expect(syncBody.success).toBe(true);
    expect(syncBody.stats.total).toBe(4);
    expect(syncBody.stats.published).toBe(2);
    expect(syncBody.stats.scheduled).toBe(2);

    // 3. Consulta o dashboard
    const dashRes = await app.inject({
      method: 'GET',
      url: '/api/dashboard',
    });

    expect(dashRes.statusCode).toBe(200);
    const dashBody = JSON.parse(dashRes.body);

    const parseResult = DashboardDataSchema.safeParse(dashBody);
    expect(parseResult.success).toBe(true);

    expect(dashBody.channel).toBeDefined();
    expect(dashBody.channel.title).toBe('IA Sem Complicar');
    expect(dashBody.counts.published).toBe(2);
    expect(dashBody.counts.scheduled).toBe(2);
    expect(dashBody.nextScheduled).toBeDefined();
    expect(dashBody.nextScheduled?.title).toContain('03 - Agentes Autônomos');
    expect(dashBody.lastScheduled).toBeDefined();
    expect(dashBody.lastScheduled?.title).toContain('04 - O Futuro do Trabalho');
    expect(dashBody.lastSyncedAt).toBeDefined();
  });
});
