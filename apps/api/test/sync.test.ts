import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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
    vi.restoreAllMocks();
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
    // 1. Cria canal conectado no banco
    const channel = await prisma.channel.create({
      data: {
        youtubeChannelId: 'UC_REAL_CHANNEL_SYNC',
        title: 'Canal de Tecnologia',
        uploadsPlaylistId: 'UU_UPLOADS_PLAYLIST_SYNC',
        oauthAccount: {
          create: {
            accessToken: 'token_sample_abc',
          },
        },
      },
    });

    // 2. Simula respostas da YouTube Data API v3 para o teste de sincronização
    const mockYouTube = {
      playlistItems: {
        list: vi.fn().mockResolvedValue({
          data: {
            items: [
              { contentDetails: { videoId: 'yt_vid_1' } },
              { contentDetails: { videoId: 'yt_vid_2' } },
            ],
            nextPageToken: null,
          },
        }),
      },
      videos: {
        list: vi.fn().mockResolvedValue({
          data: {
            items: [
              {
                id: 'yt_vid_1',
                snippet: { title: 'Vídeo Público', publishedAt: new Date().toISOString() },
                status: { privacyStatus: 'public', publishAt: null },
              },
              {
                id: 'yt_vid_2',
                snippet: { title: 'Vídeo Agendado', publishedAt: null },
                status: {
                  privacyStatus: 'private',
                  publishAt: new Date(Date.now() + 3600 * 1000 * 24).toISOString(),
                },
              },
            ],
          },
        }),
      },
    };

    vi.spyOn(OAuthService, 'getAuthenticatedYouTubeClient').mockResolvedValue({
      youtube: mockYouTube as any,
      channel,
      oauth2Client: {} as any,
    });

    // 3. Executa a sincronização via endpoint
    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/channel/sync',
    });

    expect(syncRes.statusCode).toBe(200);
    const syncBody = JSON.parse(syncRes.body);
    expect(syncBody.success).toBe(true);
    expect(syncBody.stats.total).toBe(2);
    expect(syncBody.stats.published).toBe(1);
    expect(syncBody.stats.scheduled).toBe(1);

    // 4. Consulta o dashboard
    const dashRes = await app.inject({
      method: 'GET',
      url: '/api/dashboard',
    });

    expect(dashRes.statusCode).toBe(200);
    const dashBody = JSON.parse(dashRes.body);

    const parseResult = DashboardDataSchema.safeParse(dashBody);
    expect(parseResult.success).toBe(true);

    expect(dashBody.channel).toBeDefined();
    expect(dashBody.channel.title).toBe('Canal de Tecnologia');
    expect(dashBody.counts.published).toBe(1);
    expect(dashBody.counts.scheduled).toBe(1);
    expect(dashBody.nextScheduled).toBeDefined();
  });
});
