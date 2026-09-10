import type { FastifyReply } from 'fastify';
import type { SSEEvent } from '@tubesender/shared';
import { logger } from '../config/logger.js';

class SSEBroker {
  private clients = new Set<FastifyReply['raw']>();

  public addClient(rawReply: FastifyReply['raw']) {
    this.clients.add(rawReply);
    logger.info({ totalClients: this.clients.size }, 'Novo cliente SSE conectado');

    rawReply.on('close', () => {
      this.clients.delete(rawReply);
      logger.info({ totalClients: this.clients.size }, 'Cliente SSE desconectado');
    });
  }

  public emit(event: SSEEvent) {
    const payload = `event: message\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  public get clientCount(): number {
    return this.clients.size;
  }
}

export const sseBroker = new SSEBroker();
