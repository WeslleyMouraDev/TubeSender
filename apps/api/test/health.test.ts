import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { HealthResponseSchema } from '@tubesender/shared';
import { buildApp, type AppInstance } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

describe('GET /api/health', () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('deve responder com status ok e schema válido', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('ok');
    expect(body.youtubeAuth).toBe('disconnected');
    expect(body.timestamp).toBeDefined();

    // Validação com Zod Schema compartilhado
    const parsed = HealthResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  it('deve responder com 503 e status error quando o SQLite falha', async () => {
    const queryRawSpy = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('DB Connection Failed'));

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('error');
    expect(body.database).toBe('error');
    expect(body.timestamp).toBeDefined();

    const parsed = HealthResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);

    queryRawSpy.mockRestore();
  });

  it('deve responder com 404 formatado em PT-BR para rotas inexistentes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/rota-inexistente',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.statusCode).toBe(404);
    expect(body.error).toBe('Not Found');
    expect(body.message).toContain('não encontrada');
  });
});
