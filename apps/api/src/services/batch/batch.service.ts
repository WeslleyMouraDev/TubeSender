import path from 'node:path';
import { prisma } from '../../db/prisma.js';
import { SchedulerService } from '../scheduler/scheduler.service.js';
import { ProfileService } from '../profiles/profile.service.js';
import type { BatchDTO, VideoDraftDTO, UploadJobStatus, BatchStatus } from '@tubesender/shared';

export class BatchService {
  /**
   * Limpa a extensão do arquivo para gerar título inicial amigável
   */
  public static deriveTitleFromFilename(filename: string): string {
    const ext = path.extname(filename);
    const basename = ext ? path.basename(filename, ext) : filename;
    return basename.trim();
  }

  public static mapDraftToDTO(draft: any): VideoDraftDTO {
    let customTags: string[] = [];
    if (draft.customTags) {
      try {
        customTags = JSON.parse(draft.customTags);
      } catch {
        customTags = [];
      }
    }

    return {
      id: draft.id,
      batchId: draft.batchId,
      localPath: draft.localPath,
      filename: draft.filename,
      fileSize: draft.fileSize ? Number(draft.fileSize) : null,
      title: draft.title,
      orderIndex: draft.orderIndex,
      scheduledAt: draft.scheduledAt ? draft.scheduledAt.toISOString() : null,
      customDescription: draft.customDescription,
      customTags,
      thumbnailPath: draft.thumbnailPath,
      playlistId: draft.playlistId,
      youtubeVideoId: draft.youtubeVideoId,
      status: draft.status as UploadJobStatus,
      errorMessage: draft.errorMessage,
      retryCount: draft.retryCount,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  public static mapBatchToDTO(batch: any): BatchDTO {
    return {
      id: batch.id,
      status: batch.status as BatchStatus,
      totalVideos: batch.totalVideos,
      completedVideos: batch.completedVideos,
      failedVideos: batch.failedVideos,
      drafts: (batch.drafts || []).map(this.mapDraftToDTO),
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
    };
  }

  public static async getCurrentBatch(): Promise<BatchDTO> {
    let batch = await prisma.batch.findFirst({
      where: {
        status: { in: ['DRAFT', 'READY', 'RUNNING', 'PAUSED'] },
      },
      include: {
        drafts: {
          orderBy: { orderIndex: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!batch) {
      batch = await prisma.batch.create({
        data: {
          status: 'DRAFT',
          totalVideos: 0,
        },
        include: {
          drafts: true,
        },
      });
    }

    return this.mapBatchToDTO(batch);
  }

  public static async createBatch(): Promise<BatchDTO> {
    const batch = await prisma.batch.create({
      data: {
        status: 'DRAFT',
        totalVideos: 0,
      },
      include: {
        drafts: true,
      },
    });

    return this.mapBatchToDTO(batch);
  }

  public static async addDrafts(
    batchId: string,
    files: Array<{ filename: string; localPath: string; fileSize?: number; title?: string }>
  ): Promise<BatchDTO> {
    const currentDraftsCount = await prisma.videoDraft.count({
      where: { batchId },
    });

    let nextIndex = currentDraftsCount;

    for (const file of files) {
      const initialTitle = file.title || this.deriveTitleFromFilename(file.filename);
      await prisma.videoDraft.create({
        data: {
          batchId,
          filename: file.filename,
          localPath: file.localPath,
          fileSize: file.fileSize ? BigInt(file.fileSize) : null,
          title: initialTitle,
          orderIndex: nextIndex++,
          status: 'PENDING',
        },
      });
    }

    const total = await prisma.videoDraft.count({ where: { batchId } });
    await prisma.batch.update({
      where: { id: batchId },
      data: { totalVideos: total },
    });

    const updated = await prisma.batch.findUniqueOrThrow({
      where: { id: batchId },
      include: { drafts: { orderBy: { orderIndex: 'asc' } } },
    });

    return this.mapBatchToDTO(updated);
  }

  public static async updateDraft(
    draftId: string,
    data: {
      title?: string;
      customDescription?: string | null;
      customTags?: string[];
      thumbnailPath?: string | null;
      playlistId?: string | null;
      scheduledAt?: string | null;
    }
  ): Promise<VideoDraftDTO> {
    const updated = await prisma.videoDraft.update({
      where: { id: draftId },
      data: {
        title: data.title,
        customDescription: data.customDescription,
        customTags: data.customTags ? JSON.stringify(data.customTags) : undefined,
        thumbnailPath: data.thumbnailPath,
        playlistId: data.playlistId,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      },
    });

    return this.mapDraftToDTO(updated);
  }

  public static async deleteDraft(draftId: string): Promise<BatchDTO> {
    const draft = await prisma.videoDraft.findUniqueOrThrow({
      where: { id: draftId },
    });

    await prisma.videoDraft.delete({
      where: { id: draftId },
    });

    // Reindexa drafts restantes
    const remaining = await prisma.videoDraft.findMany({
      where: { batchId: draft.batchId },
      orderBy: { orderIndex: 'asc' },
    });

    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].orderIndex !== i) {
        await prisma.videoDraft.update({
          where: { id: remaining[i].id },
          data: { orderIndex: i },
        });
      }
    }

    await prisma.batch.update({
      where: { id: draft.batchId },
      data: { totalVideos: remaining.length },
    });

    const updated = await prisma.batch.findUniqueOrThrow({
      where: { id: draft.batchId },
      include: { drafts: { orderBy: { orderIndex: 'asc' } } },
    });

    return this.mapBatchToDTO(updated);
  }

  public static async reorderDrafts(batchId: string, draftIdsInOrder: string[]): Promise<BatchDTO> {
    for (let index = 0; index < draftIdsInOrder.length; index++) {
      const id = draftIdsInOrder[index];
      await prisma.videoDraft.update({
        where: { id },
        data: { orderIndex: index },
      });
    }

    const updated = await prisma.batch.findUniqueOrThrow({
      where: { id: batchId },
      include: { drafts: { orderBy: { orderIndex: 'asc' } } },
    });

    return this.mapBatchToDTO(updated);
  }

  public static async applyScheduleToBatch(
    batchId: string,
    options: {
      slots: string[];
      timezone?: string;
      minimumLeadMinutes?: number;
      useLastScheduled?: boolean;
    }
  ): Promise<BatchDTO> {
    const batch = await prisma.batch.findUniqueOrThrow({
      where: { id: batchId },
      include: { drafts: { orderBy: { orderIndex: 'asc' } } },
    });

    if (batch.drafts.length === 0) {
      return this.mapBatchToDTO(batch);
    }

    let lastScheduledAtDate: Date | null = null;
    if (options.useLastScheduled !== false) {
      const now = new Date();
      const lastVideo = await prisma.syncedVideo.findFirst({
        where: {
          privacyStatus: 'private',
          publishAt: { gt: now },
        },
        orderBy: { publishAt: 'desc' },
      });
      if (lastVideo?.publishAt) {
        lastScheduledAtDate = lastVideo.publishAt;
      }
    }

    const dates = SchedulerService.buildSchedule({
      videoCount: batch.drafts.length,
      slots: options.slots,
      timezone: options.timezone,
      minimumLeadMinutes: options.minimumLeadMinutes,
      lastScheduledAt: lastScheduledAtDate,
    });

    for (let i = 0; i < batch.drafts.length; i++) {
      await prisma.videoDraft.update({
        where: { id: batch.drafts[i].id },
        data: {
          scheduledAt: dates[i].toJSDate(),
        },
      });
    }

    await prisma.batch.update({
      where: { id: batchId },
      data: { status: 'READY' },
    });

    const updated = await prisma.batch.findUniqueOrThrow({
      where: { id: batchId },
      include: { drafts: { orderBy: { orderIndex: 'asc' } } },
    });

    return this.mapBatchToDTO(updated);
  }

  public static async applyProfileToBatch(
    batchId: string,
    profileId: string
  ): Promise<BatchDTO> {
    const profile = await prisma.uploadProfile.findUniqueOrThrow({
      where: { id: profileId },
    });

    let profileTags: string[] = [];
    if (profile.defaultTags) {
      try {
        profileTags = JSON.parse(profile.defaultTags);
      } catch {
        profileTags = [];
      }
    }

    const batch = await prisma.batch.findUniqueOrThrow({
      where: { id: batchId },
      include: { drafts: true },
    });

    for (const draft of batch.drafts) {
      let draftTags: string[] = [];
      if (draft.customTags) {
        try {
          draftTags = JSON.parse(draft.customTags);
        } catch {
          draftTags = [];
        }
      }

      // Herança e deduplicação de tags
      const mergedTags = ProfileService.mergeTags(profileTags, [], draftTags);

      // Renderiza descrição com template
      const renderedDescription = ProfileService.renderDescription(
        '{{descricao_video}}\n\n{{descricao_padrao}}',
        draft.customDescription,
        profile.defaultDescription
      );

      await prisma.videoDraft.update({
        where: { id: draft.id },
        data: {
          customDescription: renderedDescription,
          customTags: JSON.stringify(mergedTags),
          playlistId: draft.playlistId || profile.playlistId,
        },
      });
    }

    const updated = await prisma.batch.findUniqueOrThrow({
      where: { id: batchId },
      include: { drafts: { orderBy: { orderIndex: 'asc' } } },
    });

    return this.mapBatchToDTO(updated);
  }
}
