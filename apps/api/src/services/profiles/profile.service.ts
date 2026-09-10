import { prisma } from '../../db/prisma.js';
import type { UploadProfileDTO } from '@tubesender/shared';

export class ProfileService {
  public static mapToDTO(profile: any): UploadProfileDTO {
    let defaultTags: string[] = [];
    if (profile.defaultTags) {
      try {
        defaultTags = JSON.parse(profile.defaultTags);
      } catch {
        defaultTags = [];
      }
    }

    return {
      id: profile.id,
      channelId: profile.channelId,
      name: profile.name,
      isDefault: profile.isDefault,
      defaultDescription: profile.defaultDescription,
      defaultTags,
      categoryId: profile.categoryId,
      defaultLanguage: profile.defaultLanguage,
      madeForKids: profile.madeForKids,
      containsSyntheticMedia: profile.containsSyntheticMedia,
      license: profile.license,
      embeddable: profile.embeddable,
      publicStatsViewable: profile.publicStatsViewable,
      playlistId: profile.playlistId,
      notifySubscribers: profile.notifySubscribers,
      createdAt: profile.createdAt?.toISOString(),
      updatedAt: profile.updatedAt?.toISOString(),
    };
  }

  /**
   * Renderiza a descrição substituindo variáveis de template
   */
  public static renderDescription(
    template: string | null | undefined,
    videoDescription?: string | null,
    defaultDescription?: string | null
  ): string {
    const defaultTpl = '{{descricao_video}}\n\n{{descricao_padrao}}';
    const tpl = template && template.trim().length > 0 ? template : defaultTpl;

    const vDesc = (videoDescription || '').trim();
    const dDesc = (defaultDescription || '').trim();

    let rendered = tpl
      .replace(/\{\{descricao_video\}\}/g, vDesc)
      .replace(/\{\{descricao_padrao\}\}/g, dDesc);

    // Remove quebras de linha duplas/triplas se uma das partes estiver vazia
    rendered = rendered.replace(/\n{3,}/g, '\n\n').trim();
    return rendered;
  }

  /**
   * Une e deduplica tags vindas do perfil, do lote e do vídeo individual
   */
  public static mergeTags(
    profileTags: string[] = [],
    batchTags: string[] = [],
    videoTags: string[] = []
  ): string[] {
    const combined = [...profileTags, ...batchTags, ...videoTags];
    const unique = new Set<string>();

    for (const tag of combined) {
      const clean = tag.trim();
      if (clean.length > 0) {
        unique.add(clean);
      }
    }

    return Array.from(unique);
  }

  public static async listProfiles(): Promise<UploadProfileDTO[]> {
    const items = await prisma.uploadProfile.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return items.map(this.mapToDTO);
  }

  public static async getProfile(id: string): Promise<UploadProfileDTO> {
    const item = await prisma.uploadProfile.findUniqueOrThrow({
      where: { id },
    });
    return this.mapToDTO(item);
  }

  public static async createProfile(data: any): Promise<UploadProfileDTO> {
    if (data.isDefault) {
      // Remove default dos outros perfis
      await prisma.uploadProfile.updateMany({
        data: { isDefault: false },
      });
    }

    const created = await prisma.uploadProfile.create({
      data: {
        name: data.name,
        isDefault: data.isDefault || false,
        defaultDescription: data.defaultDescription,
        defaultTags: data.defaultTags ? JSON.stringify(data.defaultTags) : '[]',
        categoryId: data.categoryId,
        defaultLanguage: data.defaultLanguage || 'pt',
        madeForKids: data.madeForKids || false,
        containsSyntheticMedia: data.containsSyntheticMedia || false,
        license: data.license || 'youtube',
        embeddable: data.embeddable !== false,
        publicStatsViewable: data.publicStatsViewable !== false,
        playlistId: data.playlistId,
        notifySubscribers: data.notifySubscribers !== false,
      },
    });

    return this.mapToDTO(created);
  }

  public static async updateProfile(id: string, data: any): Promise<UploadProfileDTO> {
    if (data.isDefault) {
      await prisma.uploadProfile.updateMany({
        where: { id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.uploadProfile.update({
      where: { id },
      data: {
        name: data.name,
        isDefault: data.isDefault,
        defaultDescription: data.defaultDescription,
        defaultTags: data.defaultTags ? JSON.stringify(data.defaultTags) : undefined,
        categoryId: data.categoryId,
        defaultLanguage: data.defaultLanguage,
        madeForKids: data.madeForKids,
        containsSyntheticMedia: data.containsSyntheticMedia,
        license: data.license,
        embeddable: data.embeddable,
        publicStatsViewable: data.publicStatsViewable,
        playlistId: data.playlistId,
        notifySubscribers: data.notifySubscribers,
      },
    });

    return this.mapToDTO(updated);
  }

  public static async deleteProfile(id: string): Promise<{ success: boolean }> {
    await prisma.uploadProfile.delete({
      where: { id },
    });
    return { success: true };
  }

  public static async setDefault(id: string): Promise<UploadProfileDTO> {
    await prisma.uploadProfile.updateMany({
      data: { isDefault: false },
    });

    const updated = await prisma.uploadProfile.update({
      where: { id },
      data: { isDefault: true },
    });

    return this.mapToDTO(updated);
  }

  public static async createFromVideo(videoId: string, profileName: string): Promise<UploadProfileDTO> {
    const video = await prisma.syncedVideo.findFirstOrThrow({
      where: {
        OR: [{ id: videoId }, { youtubeVideoId: videoId }],
      },
    });

    let tags: string[] = [];
    if (video.tags) {
      try {
        tags = JSON.parse(video.tags);
      } catch {
        tags = [];
      }
    }

    return this.createProfile({
      name: profileName || `Padrão a partir de: ${video.title.slice(0, 30)}`,
      defaultDescription: video.description,
      defaultTags: tags,
      categoryId: video.categoryId,
      madeForKids: video.madeForKids || false,
      containsSyntheticMedia: video.containsSyntheticMedia || false,
    });
  }
}
