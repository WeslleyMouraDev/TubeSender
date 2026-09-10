import { logger } from '../../config/logger.js';
import { OAuthService } from '../auth/oauth.service.js';

export class PlaylistService {
  /**
   * Adiciona um vídeo à playlist especificada no YouTube.
   * Não utiliza mocks.
   */
  public static async addToPlaylist(youtubeVideoId: string, playlistId: string): Promise<boolean> {
    const { youtube } = await OAuthService.getAuthenticatedYouTubeClient();

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

    logger.info({ youtubeVideoId, playlistId }, 'Vídeo adicionado à playlist no YouTube com sucesso');
    return true;
  }
}
