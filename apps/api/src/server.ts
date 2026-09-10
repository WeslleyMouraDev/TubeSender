import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './db/prisma.js';
import { UploadQueueService } from './services/upload/queue.service.js';

async function main() {
  const app = await buildApp();

  // Retomada e recuperação da fila de uploads após reinicialização (FASE 6)
  await UploadQueueService.recoverQueueOnStartup();

  const shutdown = async (signal: string) => {
    logger.info(`Recebido sinal ${signal}. Encerrando servidor com segurança...`);
    try {
      await app.close();
      await prisma.$disconnect();
      logger.info('Servidor e conexões encerrados.');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Erro ao encerrar servidor');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    const address = await app.listen({
      port: env.API_PORT,
      host: '127.0.0.1', // Restrito a localhost por segurança
    });
    logger.info(`Servidor TubeSender API rodando em ${address}`);
  } catch (err) {
    logger.error({ err }, 'Falha ao iniciar servidor');
    process.exit(1);
  }
}

main();
