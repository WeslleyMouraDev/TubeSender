import { google } from 'googleapis';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db/prisma.js';
import { OAuthService } from '../auth/oauth.service.js';

export class PlaylistService {
  public static async addToPlaylist(youtubeVideoId: string, playlistId: string): Promise<boolean> {
    if (OAuthService.isMockMode()) {
      logger.info({ youtubeVideoId, playlistId }, 'Vídeo mock adicionado à playlist com sucesso');
      return true;
    }

    const channel = await prisma.channel.findFirst({
      include: { oauthAccount: true },
    });
    if (!channel || !channel.oauthAccount) {
      throw new Error('Canal não conectado');
    }

    const oauth2Client = OAuthService.getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: channel.oauthAccount.accessToken,
      refresh_token: channel.oauthAccount.refreshToken ?? undefined,
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    await youtube.playlistItems.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          playlistId,
          resourceId: {
            kind: 'youtube#video',
            videoId: youtubeVideoId,
          },
        },
      },
    });

    logger.info({ youtubeVideoId, playlistId }, 'Vídeo adicionado à playlist no YouTube');
    return true;
  }
}
