import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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

  it('GET /api/auth/google/start deve retornar URL de autenticação', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/google/start',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.url).toBeDefined();
    expect(body.url).toContain('callback');
  });

  it('GET /api/auth/google/callback deve conectar com código mock e persistir canal', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/google/callback?code=mock_test_auth_code',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.channel.title).toBe('IA Sem Complicar');

    // Verifica status após login
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/auth/status',
    });
    const statusBody = JSON.parse(statusRes.body);
    expect(statusBody.connected).toBe(true);
    expect(statusBody.channel.title).toBe('IA Sem Complicar');
    expect(OAuthStatusResponseSchema.safeParse(statusBody).success).toBe(true);
  });

  it('POST /api/auth/logout deve remover credenciais mantendo o canal', async () => {
    // Conecta primeiro
    await OAuthService.handleCallback('mock_code_test');

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

  it('deve permitir novo login após logout sem colisões ou canais órfãos', async () => {
    // 1. Conecta
    await OAuthService.handleCallback('mock_code_1');
    let status = await OAuthService.getStatus();
    expect(status.connected).toBe(true);

    // 2. Desconecta
    await OAuthService.logout();
    status = await OAuthService.getStatus();
    expect(status.connected).toBe(false);

    // 3. Reconecta
    await OAuthService.handleCallback('mock_code_2');
    status = await OAuthService.getStatus();
    expect(status.connected).toBe(true);
    expect(status.channel?.title).toBeDefined();
  });
});
