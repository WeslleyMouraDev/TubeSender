import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '../../../../');

export function getResolvedDatabaseUrl(overrideUrl?: string): string {
  const envUrl = overrideUrl ?? process.env.DATABASE_URL;
  if (!envUrl) {
    const defaultDbPath = path.resolve(projectRoot, 'data/app.db').replace(/\\/g, '/');
    return `file:${defaultDbPath}`;
  }

  if (envUrl.startsWith('file:')) {
    const rawPath = envUrl.replace(/^file:/, '');
    if (path.isAbsolute(rawPath)) {
      return `file:${rawPath.replace(/\\/g, '/')}`;
    }
    // Se o caminho relativo começa com ../, foi definido relativo ao schema prisma/ (ex: ../data/app.db)
    // Se começa com ./ ou outro relativo, resolve relativo à raiz do projeto TubeSender
    const basePath = rawPath.startsWith('../')
      ? path.resolve(projectRoot, 'prisma')
      : projectRoot;
    const resolved = path.resolve(basePath, rawPath).replace(/\\/g, '/');
    return `file:${resolved}`;
  }

  return envUrl;
}

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: getResolvedDatabaseUrl(),
    },
  },
  log: [
    { level: 'warn', emit: 'event' },
    { level: 'error', emit: 'event' },
  ],
});

prisma.$on('warn' as never, (e: { message: string }) => {
  logger.warn({ msg: e.message, scope: 'prisma' });
});

prisma.$on('error' as never, (e: { message: string }) => {
  logger.error({ msg: e.message, scope: 'prisma' });
});
