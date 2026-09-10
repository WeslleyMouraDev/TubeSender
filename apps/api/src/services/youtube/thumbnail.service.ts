import fs from 'node:fs';
import { google } from 'googleapis';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db/prisma.js';
import { OAuthService } from '../auth/oauth.service.js';

export class ThumbnailService {
  public static async setThumbnail(youtubeVideoId: string, imagePath: string): Promise<boolean> {
    if (!fs.existsSync(imagePath) && !OAuthService.isMockMode()) {
      throw new Error(`Arquivo de thumbnail não encontrado: ${imagePath}`);
    }

    if (OAuthService.isMockMode()) {
      logger.info({ youtubeVideoId, imagePath }, 'Thumbnail mock definida com sucesso');
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

    await youtube.thumbnails.set({
      videoId: youtubeVideoId,
      media: {
        body: fs.createReadStream(imagePath),
      },
    });

    logger.info({ youtubeVideoId }, 'Thumbnail definida com sucesso no YouTube');
    return true;
  }
}
