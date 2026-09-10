import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import type { DiagnosticResult } from '@tubesender/shared';

export const diagnosticsRoutes: FastifyPluginAsync = async (app) => {
  // Executa diagnóstico completo de ponta a ponta sem realizar uploads reais
  app.get('/diagnostics/run', async (_request, reply) => {
    const results: DiagnosticResult[] = [];

    // 1. Diagnóstico do Banco de Dados SQLite
    try {
      await prisma.$queryRaw`SELECT 1`;
      const videoCount = await prisma.syncedVideo.count();
      results.push({
        name: 'Banco de Dados (SQLite)',
        status: 'pass',
        message: 'Conexão ativa e tabelas acessíveis',
        details: `${videoCount} vídeos registrados no banco local`,
      });
    } catch (err: any) {
      results.push({
        name: 'Banco de Dados (SQLite)',
        status: 'fail',
        message: 'Falha ao acessar o banco de dados local',
        details: err.message,
      });
    }

    // 2. Diagnóstico de Autenticação / Canal
    try {
      const channel = await prisma.channel.findFirst({
        include: { oauthAccount: true },
      });

      if (!channel || !channel.oauthAccount) {
        results.push({
          name: 'Autenticação Google / Canal',
          status: 'warn',
          message: 'Nenhum canal conectado no momento',
          details: 'Clique em "Conectar Google" no painel para vincular seu canal',
        });
      } else {
        const isExpired = channel.oauthAccount.expiresAt && channel.oauthAccount.expiresAt < new Date();
        results.push({
          name: 'Autenticação Google / Canal',
          status: 'pass',
          message: `Canal "${channel.title}" conectado`,
          details: `ID: ${channel.youtubeChannelId} (Token: ${isExpired ? 'Necessita refresh' : 'Ativo'})`,
        });
      }
    } catch (err: any) {
      results.push({
        name: 'Autenticação Google / Canal',
        status: 'fail',
        message: 'Erro ao verificar credenciais OAuth',
        details: err.message,
      });
    }

    // 3. Permissões de Armazenamento Local
    try {
      const testFilePath = path.resolve(process.cwd(), 'data', '.diag-write-test');
      fs.writeFileSync(testFilePath, 'ok', 'utf8');
      fs.unlinkSync(testFilePath);
      results.push({
        name: 'Sistema de Arquivos Local',
        status: 'pass',
        message: 'Diretório operacional com permissão total de leitura/escrita',
      });
    } catch (err: any) {
      results.push({
        name: 'Sistema de Arquivos Local',
        status: 'fail',
        message: 'Permissão de gravação negada no diretório de dados',
        details: err.message,
      });
    }

    // 4. Modo de Operação da YouTube API
    const hasCredentials = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    results.push({
      name: 'Credenciais Google Cloud OAuth',
      status: hasCredentials ? 'pass' : 'warn',
      message: hasCredentials
        ? 'Credenciais do Google OAuth configuradas no .env'
        : 'Credenciais ausentes no .env (defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET)',
      details: hasCredentials ? `Client ID: ${env.GOOGLE_CLIENT_ID.slice(0, 15)}...` : undefined,
    });

    return reply.send({
      results,
      timestamp: new Date().toISOString(),
    });
  });
};
