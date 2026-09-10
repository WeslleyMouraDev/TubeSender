import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DateTime } from 'luxon';
import { SchedulerService } from '../src/services/scheduler/scheduler.service.js';
import { buildApp, type AppInstance } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';

describe('Scheduler Engine (FASE 3 — 20 Cenários Obrigatórios)', () => {
  const TZ = 'America/Recife';

  // 1. Sem agendamentos futuros
  it('1. sem agendamentos: deve começar hoje se houver slot disponível', () => {
    const now = DateTime.fromISO('2026-09-10T10:00:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['21:00'],
      videoCount: 1,
      timezone: TZ,
    });
    expect(res).toHaveLength(1);
    expect(res[0].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-10 21:00');
  });

  // 2. Slot hoje válido
  it('2. slot hoje válido: now = 10:29, slot = 21:00 -> hoje 21:00', () => {
    const now = DateTime.fromISO('2026-09-10T10:29:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['21:00'],
      minimumLeadMinutes: 10,
      videoCount: 1,
      timezone: TZ,
    });
    expect(res[0].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-10 21:00');
  });

  // 3. Slot hoje inválido por falta de margem
  it('3. slot hoje inválido: now = 20:55, slot = 21:00, margem 10 min -> amanhã 21:00', () => {
    const now = DateTime.fromISO('2026-09-10T20:55:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['21:00'],
      minimumLeadMinutes: 10,
      videoCount: 1,
      timezone: TZ,
    });
    expect(res[0].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-11 21:00');
  });

  // 4. Exatamente na margem de 10 minutos
  it('4. exatamente 10 minutos: now = 10:20, slot = 10:30 -> hoje 10:30', () => {
    const now = DateTime.fromISO('2026-09-10T10:20:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['10:30'],
      minimumLeadMinutes: 10,
      videoCount: 1,
      timezone: TZ,
    });
    expect(res[0].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-10 10:30');
  });

  // 5. 1 slot por dia
  it('5. 1 slot por dia: distribui vídeos diariamente no mesmo horário', () => {
    const now = DateTime.fromISO('2026-09-10T10:00:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['18:00'],
      videoCount: 3,
      timezone: TZ,
    });
    expect(res).toHaveLength(3);
    expect(res[0].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-10 18:00');
    expect(res[1].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-11 18:00');
    expect(res[2].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-12 18:00');
  });

  // 6. 2 slots por dia
  it('6. 2 slots: preenche slots do mesmo dia antes de ir para o próximo', () => {
    const now = DateTime.fromISO('2026-09-10T08:00:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['12:00', '21:00'],
      videoCount: 4,
      timezone: TZ,
    });
    expect(res[0].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-10 12:00');
    expect(res[1].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-10 21:00');
    expect(res[2].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-11 12:00');
    expect(res[3].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-11 21:00');
  });

  // 7. 3 slots por dia
  it('7. 3 slots: respeita sequência dos três horários diários', () => {
    const now = DateTime.fromISO('2026-09-10T08:00:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['09:00', '15:00', '21:00'],
      videoCount: 3,
      timezone: TZ,
    });
    expect(res[0].toFormat('HH:mm')).toBe('09:00');
    expect(res[1].toFormat('HH:mm')).toBe('15:00');
    expect(res[2].toFormat('HH:mm')).toBe('21:00');
  });

  // 8. Último agendamento no primeiro slot
  it('8. último no primeiro slot: 15/09 12:00 -> próximo 15/09 21:00', () => {
    const now = DateTime.fromISO('2026-09-10T08:00:00', { zone: TZ });
    const lastScheduledAt = DateTime.fromISO('2026-09-15T12:00:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      lastScheduledAt,
      slots: ['12:00', '21:00'],
      videoCount: 2,
      timezone: TZ,
    });
    expect(res[0].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-15 21:00');
    expect(res[1].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-16 12:00');
  });

  // 9. Último agendamento no último slot
  it('9. último no último slot: 15/09 21:00 -> próximo 16/09 12:00', () => {
    const now = DateTime.fromISO('2026-09-10T08:00:00', { zone: TZ });
    const lastScheduledAt = DateTime.fromISO('2026-09-15T21:00:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      lastScheduledAt,
      slots: ['12:00', '21:00'],
      videoCount: 1,
      timezone: TZ,
    });
    expect(res[0].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-16 12:00');
  });

  // 10. Último agendamento em horário fora da configuração
  it('10. último em horário fora da configuração: 15/09 15:30 -> próximo 15/09 21:00', () => {
    const now = DateTime.fromISO('2026-09-10T08:00:00', { zone: TZ });
    const lastScheduledAt = DateTime.fromISO('2026-09-15T15:30:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      lastScheduledAt,
      slots: ['12:00', '21:00'],
      videoCount: 1,
      timezone: TZ,
    });
    expect(res[0].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-09-15 21:00');
  });

  // 11. Virada de mês
  it('11. virada de mês: transição de 31/01 para 01/02', () => {
    const now = DateTime.fromISO('2026-01-31T22:00:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['12:00'],
      videoCount: 1,
      timezone: TZ,
    });
    expect(res[0].toFormat('yyyy-MM-dd HH:mm')).toBe('2026-02-01 12:00');
  });

  // 12. Virada de ano
  it('12. virada de ano: transição de 31/12 para 01/01', () => {
    const now = DateTime.fromISO('2026-12-31T22:00:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['12:00'],
      videoCount: 1,
      timezone: TZ,
    });
    expect(res[0].toFormat('yyyy-MM-dd HH:mm')).toBe('2027-01-01 12:00');
  });

  // 13. Timezone correto
  it('13. timezone: formata preview com hora local exata', () => {
    const now = DateTime.fromISO('2026-09-10T08:00:00', { zone: TZ });
    const dates = SchedulerService.buildSchedule({
      now,
      slots: ['21:00'],
      videoCount: 1,
      timezone: TZ,
    });
    const preview = SchedulerService.formatPreview(dates, TZ, null);
    expect(preview.items[0].formattedLocal).toBe('10/09/2026 21:00');
    expect(preview.timezone).toBe(TZ);
  });

  // 14. Slots desordenados
  it('14. slots desordenados: ordena automaticamente', () => {
    const now = DateTime.fromISO('2026-09-10T08:00:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['21:00', '09:00', '15:00'],
      videoCount: 3,
      timezone: TZ,
    });
    expect(res[0].toFormat('HH:mm')).toBe('09:00');
    expect(res[1].toFormat('HH:mm')).toBe('15:00');
    expect(res[2].toFormat('HH:mm')).toBe('21:00');
  });

  // 15. Slots duplicados
  it('15. duplicatas: ignora slots duplicados', () => {
    const now = DateTime.fromISO('2026-09-10T08:00:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['12:00', '21:00', '12:00'],
      videoCount: 2,
      timezone: TZ,
    });
    expect(res[0].toFormat('HH:mm')).toBe('12:00');
    expect(res[1].toFormat('HH:mm')).toBe('21:00');
  });

  // 16. Zero vídeos
  it('16. zero vídeos: retorna array vazio', () => {
    const res = SchedulerService.buildSchedule({
      slots: ['12:00'],
      videoCount: 0,
      timezone: TZ,
    });
    expect(res).toEqual([]);
  });

  // 17. 1 vídeo
  it('17. 1 vídeo: retorna exatamente um elemento', () => {
    const now = DateTime.fromISO('2026-09-10T08:00:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['12:00'],
      videoCount: 1,
      timezone: TZ,
    });
    expect(res).toHaveLength(1);
  });

  // 18. 100 vídeos
  it('18. 100 vídeos: gera lista sequencial crescente sem erros', () => {
    const now = DateTime.fromISO('2026-09-10T08:00:00', { zone: TZ });
    const res = SchedulerService.buildSchedule({
      now,
      slots: ['12:00', '21:00'],
      videoCount: 100,
      timezone: TZ,
    });
    expect(res).toHaveLength(100);
    for (let i = 1; i < res.length; i++) {
      expect(res[i] > res[i - 1]).toBe(true);
    }
  });

  // 19. Horário inválido
  it('19. horário inválido: lança erro descritivo', () => {
    expect(() =>
      SchedulerService.buildSchedule({
        slots: ['25:00'],
        videoCount: 1,
        timezone: TZ,
      })
    ).toThrow(/Horário inválido/);
  });

  // 20. Timezone inválido
  it('20. timezone inválido: lança erro descritivo', () => {
    expect(() =>
      SchedulerService.buildSchedule({
        slots: ['12:00'],
        videoCount: 1,
        timezone: 'Planeta/Marte',
      })
    ).toThrow(/Timezone inválido/);
  });
});

describe('POST /api/schedule/preview endpoint', () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('deve retornar prévia formatada com 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/schedule/preview',
      payload: {
        videoCount: 3,
        slots: ['12:00', '21:00'],
        timezone: 'America/Recife',
        minimumLeadMinutes: 10,
        useLastScheduled: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(3);
    expect(body.timezone).toBe('America/Recife');
    expect(body.items[0].videoIndex).toBe(1);
    expect(body.items[0].formattedLocal).toBeDefined();
    expect(body.items[0].scheduledAt).toBeDefined();
  });

  it('deve retornar 400 se slots estiverem vazios', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/schedule/preview',
      payload: {
        videoCount: 3,
        slots: [],
      },
    });

    expect(res.statusCode).toBe(400);
  });
});
