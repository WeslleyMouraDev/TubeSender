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
  public static isMockMode(): boolean {
    return (
      process.env.MOCK_OAUTH === 'true' ||
      !env.GOOGLE_CLIENT_ID ||
      !env.GOOGLE_CLIENT_SECRET
    );
  }

  public static getOAuth2Client(redirectUri?: string) {
    const callbackUrl = redirectUri || env.GOOGLE_REDIRECT_URI;
    return new google.auth.OAuth2(
      env.GOOGLE_CLIENT_ID || 'mock-client-id',
      env.GOOGLE_CLIENT_SECRET || 'mock-client-secret',
      callbackUrl
    );
  }

  public static getAuthUrl(redirectUri?: string): string {
    const callbackUrl = redirectUri || env.GOOGLE_REDIRECT_URI;
    if (this.isMockMode()) {
      logger.info({ mode: 'mock' }, 'Gerando URL de autenticação mock');
      return `${callbackUrl}?code=mock_google_oauth_code_success`;
    }

    const oauth2Client = this.getOAuth2Client(callbackUrl);
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: YOUTUBE_SCOPES,
    });
  }

  public static async handleCallback(code: string, redirectUri?: string) {
    const callbackUrl = redirectUri || env.GOOGLE_REDIRECT_URI;

    if (this.isMockMode() || code.startsWith('mock_')) {
      logger.info({ mode: 'mock' }, 'Processando callback OAuth em modo mock');
      const mockChannelId = 'UC_MOCK_CHANNEL_123';
      const mockTitle = 'IA Sem Complicar';
      const mockThumbnail = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=60';
      const mockPlaylistId = 'UU_MOCK_PLAYLIST_123';

      const channel = await prisma.channel.upsert({
        where: { youtubeChannelId: mockChannelId },
        create: {
          youtubeChannelId: mockChannelId,
          title: mockTitle,
          thumbnailUrl: mockThumbnail,
          uploadsPlaylistId: mockPlaylistId,
          oauthAccount: {
            create: {
              accessToken: 'mock_access_token_' + Date.now(),
              refreshToken: 'mock_refresh_token_123',
              tokenType: 'Bearer',
              scope: YOUTUBE_SCOPES.join(' '),
              expiresAt: new Date(Date.now() + 3600 * 1000 * 24),
            },
          },
          syncState: {
            create: {
              status: 'IDLE',
            },
          },
        },
        update: {
          title: mockTitle,
          thumbnailUrl: mockThumbnail,
          uploadsPlaylistId: mockPlaylistId,
          oauthAccount: {
            upsert: {
              create: {
                accessToken: 'mock_access_token_' + Date.now(),
                refreshToken: 'mock_refresh_token_123',
                tokenType: 'Bearer',
                scope: YOUTUBE_SCOPES.join(' '),
                expiresAt: new Date(Date.now() + 3600 * 1000 * 24),
              },
              update: {
                accessToken: 'mock_access_token_' + Date.now(),
                refreshToken: 'mock_refresh_token_123',
                expiresAt: new Date(Date.now() + 3600 * 1000 * 24),
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
          message: 'Canal autenticado com sucesso (Modo Mock)',
          metadata: JSON.stringify({ channelId: channel.id, youtubeChannelId: channel.youtubeChannelId }),
        },
      });

      return channel;
    }

    // Fluxo real com Google OAuth2
    const oauth2Client = this.getOAuth2Client(callbackUrl);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const response = await youtube.channels.list({
      part: ['snippet', 'contentDetails'],
      mine: true,
    });

    const items = response.data.items;
    if (!items || items.length === 0) {
      throw new Error('Nenhum canal do YouTube encontrado para a conta informada');
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
        message: 'Canal conectado com sucesso',
        metadata: JSON.stringify({ channelId: channel.id, youtubeChannelId: channel.youtubeChannelId }),
      },
    });

    return channel;
  }

  public static async getStatus(): Promise<OAuthStatusResponse> {
    const channel = await prisma.channel.findFirst({
      where: { oauthAccount: { isNot: null } },
      include: { oauthAccount: true },
    });

    if (!channel || !channel.oauthAccount) {
      return { connected: false };
    }

    // Verifica renovação de token se expirado
    const now = new Date();
    if (
      channel.oauthAccount.expiresAt &&
      channel.oauthAccount.expiresAt < now &&
      channel.oauthAccount.refreshToken &&
      !this.isMockMode()
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
        logger.error({ err: err.message }, 'Falha ao renovar access token com refresh token');
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
          message: 'Desconectado da conta do YouTube / Google',
        },
      });
    }

    return { success: true };
  }
}
