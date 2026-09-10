import { google } from 'googleapis';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db/prisma.js';
import type { OAuthStatusResponse } from '@tubesender/shared';

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube',
];

export class OAuthService {
  /**
   * Retorna instância configurada do cliente Google OAuth2.
   * Não utiliza mocks: requer credenciais reais no .env.
   */
  public static getOAuth2Client(redirectUri?: string) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error(
        'Credenciais do Google OAuth ausentes. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no arquivo .env.'
      );
    }

    const callbackUrl = redirectUri || env.GOOGLE_REDIRECT_URI;
    return new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      callbackUrl
    );
  }

  /**
   * Gera URL real de autorização do Google OAuth 2.0.
   */
  public static getAuthUrl(redirectUri?: string): string {
    const callbackUrl = redirectUri || env.GOOGLE_REDIRECT_URI;
    const oauth2Client = this.getOAuth2Client(callbackUrl);

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: YOUTUBE_SCOPES,
    });
  }

  /**
   * Processa o código de autorização retornado pelo Google,
   * troca por tokens reais e persiste os dados reais do canal.
   */
  public static async handleCallback(code: string, redirectUri?: string) {
    const callbackUrl = redirectUri || env.GOOGLE_REDIRECT_URI;
    const oauth2Client = this.getOAuth2Client(callbackUrl);

    // Troca o código pelos tokens reais
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Consulta canal real autenticado na YouTube Data API v3
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const response = await youtube.channels.list({
      part: ['snippet', 'contentDetails'],
      mine: true,
    });

    const items = response.data.items;
    if (!items || items.length === 0) {
      throw new Error('Nenhum canal do YouTube encontrado para a conta do Google informada.');
    }

    const channelData = items[0];
    const youtubeChannelId = channelData.id!;
    const title = channelData.snippet?.title || 'Canal do YouTube';
    const thumbnailUrl =
      channelData.snippet?.thumbnails?.default?.url ||
      channelData.snippet?.thumbnails?.medium?.url ||
      null;
    const uploadsPlaylistId =
      channelData.contentDetails?.relatedPlaylists?.uploads || null;

    // Salva ou atualiza os dados reais no SQLite
    const channel = await prisma.channel.upsert({
      where: { youtubeChannelId },
      create: {
        youtubeChannelId,
        title,
        thumbnailUrl,
        uploadsPlaylistId,
        oauthAccount: {
          create: {
            accessToken: tokens.access_token || '',
            refreshToken: tokens.refresh_token,
            tokenType: tokens.token_type || 'Bearer',
            scope: tokens.scope || YOUTUBE_SCOPES.join(' '),
            expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          },
        },
        syncState: {
          create: {
            status: 'IDLE',
          },
        },
      },
      update: {
        title,
        thumbnailUrl,
        uploadsPlaylistId,
        oauthAccount: {
          upsert: {
            create: {
              accessToken: tokens.access_token || '',
              refreshToken: tokens.refresh_token,
              tokenType: tokens.token_type || 'Bearer',
              scope: tokens.scope || YOUTUBE_SCOPES.join(' '),
              expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            },
            update: {
              accessToken: tokens.access_token || '',
              refreshToken: tokens.refresh_token ?? undefined,
              expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
            },
          },
        },
      },
      include: {
        oauthAccount: true,
      },
    });

    await prisma.operationLog.create({
      data: {
        level: 'INFO',
        category: 'AUTH',
        message: `Canal "${channel.title}" conectado com sucesso`,
        metadata: JSON.stringify({ channelId: channel.id, youtubeChannelId: channel.youtubeChannelId }),
      },
    });

    return channel;
  }

  /**
   * Retorna o cliente da YouTube Data API v3 autenticado com o canal ativo.
   * Renova automaticamente o access token se expirado.
   */
  public static async getAuthenticatedYouTubeClient() {
    const channel = await prisma.channel.findFirst({
      where: { oauthAccount: { isNot: null } },
      include: { oauthAccount: true },
    });

    if (!channel || !channel.oauthAccount) {
      throw new Error('Nenhum canal do YouTube conectado. Faça login antes de continuar.');
    }

    const oauth2Client = this.getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: channel.oauthAccount.accessToken,
      refresh_token: channel.oauthAccount.refreshToken ?? undefined,
    });

    // Se o token estiver expirado, renova com refresh token
    const now = new Date();
    if (
      channel.oauthAccount.expiresAt &&
      channel.oauthAccount.expiresAt < now &&
      channel.oauthAccount.refreshToken
    ) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        await prisma.oAuthAccount.update({
          where: { id: channel.oauthAccount.id },
          data: {
            accessToken: credentials.access_token || channel.oauthAccount.accessToken,
            expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
          },
        });
        logger.info({ channelId: channel.id }, 'Access token renovado com sucesso via refresh token');
      } catch (err: any) {
        logger.error({ err: err.message }, 'Falha ao renovar token OAuth do canal');
        throw new Error(`Falha ao renovar autenticação do YouTube: ${err.message}`);
      }
    }

    return {
      youtube: google.youtube({ version: 'v3', auth: oauth2Client }),
      channel,
      oauth2Client,
    };
  }

  /**
   * Retorna o status atual de conexão do canal.
   */
  public static async getStatus(): Promise<OAuthStatusResponse> {
    const channel = await prisma.channel.findFirst({
      where: { oauthAccount: { isNot: null } },
      include: { oauthAccount: true },
    });

    if (!channel || !channel.oauthAccount) {
      return { connected: false };
    }

    // Verifica e renova token se expirado
    const now = new Date();
    if (
      channel.oauthAccount.expiresAt &&
      channel.oauthAccount.expiresAt < now &&
      channel.oauthAccount.refreshToken
    ) {
      try {
        const oauth2Client = this.getOAuth2Client();
        oauth2Client.setCredentials({
          refresh_token: channel.oauthAccount.refreshToken,
        });
        const { credentials } = await oauth2Client.refreshAccessToken();

        await prisma.oAuthAccount.update({
          where: { id: channel.oauthAccount.id },
          data: {
            accessToken: credentials.access_token || channel.oauthAccount.accessToken,
            expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
          },
        });
      } catch (err: any) {
        logger.error({ err: err.message }, 'Falha ao renovar access token com refresh token no getStatus');
      }
    }

    return {
      connected: true,
      channel: {
        id: channel.id,
        youtubeChannelId: channel.youtubeChannelId,
        title: channel.title,
        thumbnailUrl: channel.thumbnailUrl,
        uploadsPlaylistId: channel.uploadsPlaylistId,
      },
      expiresAt: channel.oauthAccount.expiresAt?.toISOString() || null,
    };
  }

  /**
   * Desconecta o canal e remove tokens locais.
   */
  public static async logout(): Promise<{ success: boolean }> {
    const channel = await prisma.channel.findFirst({
      where: { oauthAccount: { isNot: null } },
      include: { oauthAccount: true },
    });

    if (channel) {
      await prisma.channel.delete({
        where: { id: channel.id },
      });
      await prisma.operationLog.create({
        data: {
          level: 'INFO',
          category: 'AUTH',
          message: 'Canal desconectado com sucesso',
        },
      });
    }

    return { success: true };
  }
}
