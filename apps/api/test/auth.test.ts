import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { OAuthStatusResponseSchema } from '@tubesender/shared';
import { buildApp, type AppInstance } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { OAuthService } from '../src/services/auth/oauth.service.js';

describe('Auth Routes and Service (FASE 1)', () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.oAuthAccount.deleteMany();
    await prisma.channel.deleteMany();
    vi.restoreAllMocks();
  });

  it('GET /api/auth/status deve retornar disconnected quando não há conta', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/status',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.connected).toBe(false);
    expect(OAuthStatusResponseSchema.safeParse(body).success).toBe(true);
  });

  it('GET /api/auth/google/start deve retornar URL de autorização', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/google/start',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.url).toBeDefined();
    expect(body.url).toContain('accounts.google.com');
  });

  it('GET /api/auth/google/callback deve conectar com código de autorização e persistir canal', async () => {
    const mockChannel = {
      id: 'chan_test_1',
      youtubeChannelId: 'UC_REAL_CHANNEL_1',
      title: 'Canal Oficial de Teste',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      uploadsPlaylistId: 'UU_PLAYLIST_1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.spyOn(OAuthService, 'handleCallback').mockResolvedValue(mockChannel as any);

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=real_auth_code_sample',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.channel.title).toBe('Canal Oficial de Teste');
  });

  it('POST /api/auth/logout deve desconectar o canal com sucesso', async () => {
    // Cria canal conectado
    const channel = await prisma.channel.create({
      data: {
        youtubeChannelId: 'UC_LOGOUT_TEST',
        title: 'Canal Logout',
        oauthAccount: {
          create: {
            accessToken: 'sample_token',
          },
        },
      },
    });

    expect(await OAuthService.getStatus()).toMatchObject({ connected: true });

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });

    expect(logoutRes.statusCode).toBe(200);
    const logoutBody = JSON.parse(logoutRes.body);
    expect(logoutBody.success).toBe(true);

    // Confirma status desconectado
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/auth/status',
    });
    const statusBody = JSON.parse(statusRes.body);
    expect(statusBody.connected).toBe(false);
  });
});
