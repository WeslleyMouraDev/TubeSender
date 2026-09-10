import fastifyCors from '@fastify/cors';
import fastify, { type FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { healthRoutes } from './routes/health.js';

export async function buildApp() {
  const app = fastify({
    loggerInstance: logger as any,
  });

  // Configuração restrita e segura de CORS para o frontend local
  await app.register(fastifyCors, {
    origin: [
      `http://localhost:${env.WEB_PORT}`,
      `http://127.0.0.1:${env.WEB_PORT}`,
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Tratamento global de erros sanitizado
  app.setErrorHandler((error: FastifyError | Error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Falha na validação dos dados de entrada',
        issues: error.issues,
      });
    }

    const fastifyError = error as FastifyError;
    const statusCode =
      typeof fastifyError.statusCode === 'number' &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 600
        ? fastifyError.statusCode
        : 500;

    logger.error({
      err: {
        message: error.message,
        name: error.name,
        stack: env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      statusCode,
    });

    return reply.status(statusCode).send({
      statusCode,
      error: statusCode >= 500 ? 'Internal Server Error' : error.name,
      message: statusCode >= 500 ? 'Ocorreu um erro interno no servidor' : error.message,
    });
  });

  // Handler para rotas inexistentes (404)
  app.setNotFoundHandler((request, reply) => {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Rota ${request.method} ${request.url} não encontrada`,
    });
  });

  // Registro de rotas com prefixo /api
  await app.register(healthRoutes, { prefix: '/api' });

  return app;
}

export type AppInstance = Awaited<ReturnType<typeof buildApp>>;
