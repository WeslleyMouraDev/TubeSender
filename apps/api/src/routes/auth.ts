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
    const query = request.query as { redirect_uri?: string; redirect?: string };
    const customRedirectUri = query.redirect_uri || query.redirect;
    const authUrl = OAuthService.getAuthUrl(customRedirectUri);
    return reply.send({ url: authUrl });
  });

  // Callback de autorização do Google
  app.get('/auth/google/callback', async (request, reply) => {
    const querySchema = z.object({
      code: z.string().optional(),
      error: z.string().optional(),
      error_description: z.string().optional(),
    });

    const parsed = querySchema.safeParse(request.query);
    const isBrowserRequest = (request.headers.accept || '').includes('text/html');

    if (!parsed.success || (!parsed.data.code && !parsed.data.error)) {
      if (isBrowserRequest) {
        return reply.redirect(
          `http://localhost:${env.WEB_PORT}/?auth=error&message=${encodeURIComponent('Código de autorização não fornecido pelo Google')}`
        );
      }
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Código de autorização não fornecido ou inválido',
      });
    }

    if (parsed.data.error) {
      const errorMsg = parsed.data.error_description || parsed.data.error;
      if (isBrowserRequest) {
        return reply.redirect(
          `http://localhost:${env.WEB_PORT}/?auth=error&message=${encodeURIComponent(errorMsg)}`
        );
      }
      return reply.status(400).send({
        error: 'OAuth Error',
        message: `Erro retornado pelo Google: ${errorMsg}`,
      });
    }

    try {
      const channel = await OAuthService.handleCallback(parsed.data.code!);

      // Redireciona de volta para o frontend se for chamada pelo navegador direto
      if (isBrowserRequest) {
        return reply.redirect(`http://localhost:${env.WEB_PORT}/?auth=success&channel=${encodeURIComponent(channel.title)}`);
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
      if (isBrowserRequest) {
        return reply.redirect(
          `http://localhost:${env.WEB_PORT}/?auth=error&message=${encodeURIComponent(err.message || 'Falha ao processar autorização')}`
        );
      }
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
