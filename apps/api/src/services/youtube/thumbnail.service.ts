import fs from 'node:fs';
import { logger } from '../../config/logger.js';
import { OAuthService } from '../auth/oauth.service.js';

export class ThumbnailService {
  /**
   * Envia uma imagem customizada para o vídeo especificado no YouTube.
   * Não utiliza mocks.
   */
  public static async setThumbnail(youtubeVideoId: string, imagePath: string): Promise<boolean> {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Arquivo de thumbnail não encontrado: ${imagePath}`);
    }

    const { youtube } = await OAuthService.getAuthenticatedYouTubeClient();

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
