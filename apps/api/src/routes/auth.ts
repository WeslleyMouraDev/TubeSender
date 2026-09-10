import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { OAuthService } from '../services/auth/oauth.service.js';
import { env } from '../config/env.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Retorna status atual da conexão com o YouTube
  app.get('/auth/status', async (_request, reply) => {
    const status = await OAuthService.getStatus();
    return reply.send(status);
  });

  // Inicia o fluxo OAuth 2.0 gerando a URL de autorização
  app.get('/auth/google/start', async (request, reply) => {
    const query = request.query as { redirect?: string };
    const authUrl = OAuthService.getAuthUrl(query.redirect);
    return reply.send({ url: authUrl });
  });

  // Callback de autorização do Google
  app.get('/auth/google/callback', async (request, reply) => {
    const querySchema = z.object({
      code: z.string().min(1, 'Código de autorização ausente'),
      error: z.string().optional(),
    });

    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Código de autorização não fornecido ou inválido',
      });
    }

    if (parsed.data.error) {
      return reply.status(400).send({
        error: 'OAuth Error',
        message: `Erro retornado pelo Google: ${parsed.data.error}`,
      });
    }

    try {
      const channel = await OAuthService.handleCallback(parsed.data.code);

      // Redireciona de volta para o frontend se for chamada pelo navegador direto
      const acceptHeader = request.headers.accept || '';
      if (acceptHeader.includes('text/html')) {
        return reply.redirect(`http://localhost:${env.WEB_PORT}/?auth=success`);
      }

      return reply.send({
        success: true,
        channel: {
          id: channel.id,
          youtubeChannelId: channel.youtubeChannelId,
          title: channel.title,
          thumbnailUrl: channel.thumbnailUrl,
        },
      });
    } catch (err: any) {
      return reply.status(500).send({
        error: 'OAuth Callback Failed',
        message: err.message || 'Falha ao processar autorização',
      });
    }
  });

  // Desconecta o canal e remove tokens de autenticação
  app.post('/auth/logout', async (_request, reply) => {
    const result = await OAuthService.logout();
    return reply.send(result);
  });
};
