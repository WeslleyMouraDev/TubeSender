import { logger } from '../../config/logger.js';
import { prisma } from '../../db/prisma.js';
import { UploadService } from './upload.service.js';
import { sseBroker } from '../../events/sse.js';
import type { BatchStatus } from '@tubesender/shared';

export class UploadQueueService {
  private static isProcessing = false;
  private static pausedBatchIds = new Set<string>();

  public static isDefinitiveError(errMsg: string): boolean {
    const lower = errMsg.toLowerCase();
    return (
      lower.includes('arquivo não encontrado') ||
      lower.includes('não é um arquivo') ||
      lower.includes('vazio (0 bytes)') ||
      lower.includes('quotaexceeded') ||
      lower.includes('invalid_grant') ||
      lower.includes('unauthorized') ||
      lower.includes('canal não conectado')
    );
  }

  public static getBackoffDelayMs(retryCount: number): number {
    switch (retryCount) {
      case 0:
        return 5000;
      case 1:
        return 15000;
      default:
        return 45000;
    }
  }

  public static async startBatch(batchId: string): Promise<void> {
    this.pausedBatchIds.delete(batchId);

    await prisma.batch.update({
      where: { id: batchId },
      data: { status: 'RUNNING' },
    });

    sseBroker.emit({
      type: 'batch.status',
      batchId,
      status: 'RUNNING',
      completedVideos: 0,
      failedVideos: 0,
    });

    this.triggerWorker();
  }

  public static async pauseBatch(batchId: string): Promise<void> {
    this.pausedBatchIds.add(batchId);

    await prisma.batch.update({
      where: { id: batchId },
      data: { status: 'PAUSED' },
    });

    const batch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    sseBroker.emit({
      type: 'batch.status',
      batchId,
      status: 'PAUSED',
      completedVideos: batch.completedVideos,
      failedVideos: batch.failedVideos,
    });
  }

  public static async cancelBatch(batchId: string): Promise<void> {
    this.pausedBatchIds.delete(batchId);

    await prisma.videoDraft.updateMany({
      where: {
        batchId,
        status: { in: ['PENDING', 'VALIDATING'] },
      },
      data: {
        status: 'CANCELED',
      },
    });

    await prisma.batch.update({
      where: { id: batchId },
      data: { status: 'CANCELED' },
    });

    const batch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
    sseBroker.emit({
      type: 'batch.status',
      batchId,
      status: 'CANCELED',
      completedVideos: batch.completedVideos,
      failedVideos: batch.failedVideos,
    });
  }

  public static async retryDraft(draftId: string): Promise<void> {
    const draft = await prisma.videoDraft.update({
      where: { id: draftId },
      data: {
        status: 'PENDING',
        errorMessage: null,
      },
    });

    // Se o lote estava parado ou falho, coloca em RUNNING
    await prisma.batch.update({
      where: { id: draft.batchId },
      data: { status: 'RUNNING' },
    });

    this.triggerWorker();
  }

  public static async recoverQueueOnStartup(): Promise<void> {
    logger.info('Verificando integridade e recuperação da fila de uploads...');

    // 1. Resgata rascunhos interrompidos em VALIDATING ou UPLOADING
    const interruptedDrafts = await prisma.videoDraft.findMany({
      where: {
        status: { in: ['VALIDATING', 'UPLOADING'] },
      },
    });

    for (const draft of interruptedDrafts) {
      if (draft.youtubeVideoId) {
        // Já possui ID registrado no YouTube: marca como UPLOADED para evitar duplicata
        await prisma.videoDraft.update({
          where: { id: draft.id },
          data: { status: 'UPLOADED' },
        });
        logger.info({ draftId: draft.id, youtubeVideoId: draft.youtubeVideoId }, 'Draft recuperado como UPLOADED (evita upload duplicado)');
      } else {
        // Não completou o envio: reseta para PENDING com aviso
        await prisma.videoDraft.update({
          where: { id: draft.id },
          data: {
            status: 'PENDING',
            errorMessage: 'Envio interrompido antes do término; resetado para nova tentativa',
          },
        });
        logger.info({ draftId: draft.id }, 'Draft resetado para PENDING após reinício');
      }
    }

    // 2. Retoma automaticamente lotes que estavam em RUNNING
    const runningBatches = await prisma.batch.findMany({
      where: { status: 'RUNNING' },
    });

    if (runningBatches.length > 0) {
      logger.info({ count: runningBatches.length }, 'Retomando execução de lotes RUNNING');
      this.triggerWorker();
    }
  }

  public static triggerWorker() {
    if (this.isProcessing) return;
    this.processQueue().catch((err) => {
      logger.error({ err: err.message }, 'Erro não tratado no worker de upload');
      this.isProcessing = false;
    });
  }

  private static async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (true) {
        const pausedIds = Array.from(this.pausedBatchIds);

        // Encontra o próximo draft PENDING em um lote RUNNING que não esteja pausado
        const nextDraft = await prisma.videoDraft.findFirst({
          where: {
            status: 'PENDING',
            ...(pausedIds.length > 0 ? { batchId: { notIn: pausedIds } } : {}),
            batch: {
              status: 'RUNNING',
            },
          },
          include: { batch: true },
          orderBy: [{ batchId: 'asc' }, { orderIndex: 'asc' }],
        });

        if (!nextDraft) {
          // Nenhum trabalho pendente
          break;
        }

        // Dupla checagem em memória
        if (this.pausedBatchIds.has(nextDraft.batchId)) {
          break;
        }

        try {
          await UploadService.uploadVideo({ draftId: nextDraft.id });

          // Atualiza contador do lote
          await prisma.batch.update({
            where: { id: nextDraft.batchId },
            data: {
              completedVideos: { increment: 1 },
            },
          });
        } catch (err: any) {
          const errMsg = err.message || 'Erro desconhecido durante upload';
          const isDefinitive = this.isDefinitiveError(errMsg);

          if (isDefinitive || nextDraft.retryCount >= 2) {
            // Falha definitiva
            await prisma.videoDraft.update({
              where: { id: nextDraft.id },
              data: {
                status: 'FAILED',
                errorMessage: errMsg,
              },
            });

            await prisma.batch.update({
              where: { id: nextDraft.batchId },
              data: {
                failedVideos: { increment: 1 },
              },
            });

            sseBroker.emit({
              type: 'job.status',
              draftId: nextDraft.id,
              batchId: nextDraft.batchId,
              status: 'FAILED',
              errorMessage: errMsg,
            });
          } else {
            // Falha transitória -> incrementa retryCount e reseta status para PENDING
            const newRetry = nextDraft.retryCount + 1;
            await prisma.videoDraft.update({
              where: { id: nextDraft.id },
              data: {
                status: 'PENDING',
                retryCount: newRetry,
                errorMessage: `Tentativa ${newRetry} falhou: ${errMsg}`,
              },
            });

            sseBroker.emit({
              type: 'job.status',
              draftId: nextDraft.id,
              batchId: nextDraft.batchId,
              status: 'PENDING',
              errorMessage: `Tentativa ${newRetry} falhou: ${errMsg}`,
            });

            // Backoff simples em teste/prod
            const delay = process.env.NODE_ENV === 'test' ? 50 : this.getBackoffDelayMs(nextDraft.retryCount);
            await new Promise((res) => setTimeout(res, delay));
          }
        }

        // Verifica se o lote terminou
        await this.checkBatchCompletion(nextDraft.batchId);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private static async checkBatchCompletion(batchId: string) {
    const remainingPending = await prisma.videoDraft.count({
      where: {
        batchId,
        status: { in: ['PENDING', 'VALIDATING', 'UPLOADING'] },
      },
    });

    if (remainingPending === 0) {
      const batch = await prisma.batch.findUniqueOrThrow({ where: { id: batchId } });
      let finalStatus: BatchStatus = 'COMPLETED';
      if (batch.failedVideos > 0 && batch.completedVideos > 0) {
        finalStatus = 'PARTIAL';
      } else if (batch.failedVideos > 0 && batch.completedVideos === 0) {
        finalStatus = 'FAILED';
      }

      await prisma.batch.update({
        where: { id: batchId },
        data: { status: finalStatus },
      });

      sseBroker.emit({
        type: 'batch.status',
        batchId,
        status: finalStatus,
        completedVideos: batch.completedVideos,
        failedVideos: batch.failedVideos,
      });

      await prisma.operationLog.create({
        data: {
          level: 'INFO',
          category: 'UPLOAD',
          message: `Lote ${batchId} finalizado com status: ${finalStatus}`,
          metadata: JSON.stringify({
            completed: batch.completedVideos,
            failed: batch.failedVideos,
            total: batch.totalVideos,
          }),
        },
      });
    }
  }
}
