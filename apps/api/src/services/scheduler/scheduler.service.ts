import { DateTime, IANAZone } from 'luxon';
import type { SchedulePreviewItem, SchedulePreviewResponse } from '@tubesender/shared';

export interface BuildScheduleInput {
  now?: DateTime | Date | string;
  slots: string[];
  minimumLeadMinutes?: number;
  lastScheduledAt?: DateTime | Date | string | null;
  videoCount: number;
  timezone?: string;
}

export interface ParsedSlot {
  hour: number;
  minute: number;
  raw: string;
}

export class SchedulerService {
  public static readonly DEFAULT_TIMEZONE = 'America/Recife';
  public static readonly DEFAULT_MIN_LEAD_MINUTES = 10;

  /**
   * Valida e normaliza um timezone
   */
  public static validateTimezone(tz: string): string {
    if (!tz || typeof tz !== 'string') {
      throw new Error(`Timezone inválido: "${tz}". Forneça um fuso IANA válido como "America/Recife".`);
    }
    if (!IANAZone.isValidZone(tz)) {
      throw new Error(`Timezone inválido: "${tz}". Forneça um fuso IANA válido como "America/Recife".`);
    }
    return tz;
  }

  /**
   * Valida e normaliza a lista de slots diários (ex: ["21:00", "12:00"] -> [{12:00}, {21:00}])
   */
  public static normalizeSlots(slots: string[]): ParsedSlot[] {
    if (!Array.isArray(slots) || slots.length === 0) {
      throw new Error('Pelo menos um slot de horário deve ser especificado.');
    }

    const uniqueSet = new Set<string>();
    const parsed: ParsedSlot[] = [];

    for (const raw of slots) {
      const trimmed = raw.trim();
      const match = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
      if (!match) {
        throw new Error(`Horário inválido: "${raw}". Formato esperado: "HH:mm" (ex: "12:00", "21:00").`);
      }

      if (!uniqueSet.has(trimmed)) {
        uniqueSet.add(trimmed);
        parsed.push({
          hour: parseInt(match[1], 10),
          minute: parseInt(match[2], 10),
          raw: trimmed,
        });
      }
    }

    // Ordena os slots cronologicamente pelo minuto do dia
    return parsed.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  }

  /**
   * Construtor de agenda determinístico com Luxon
   */
  public static buildSchedule(input: BuildScheduleInput): DateTime[] {
    const tz = this.validateTimezone(input.timezone || this.DEFAULT_TIMEZONE);
    const videoCount = input.videoCount;

    if (videoCount <= 0) {
      return [];
    }

    const slots = this.normalizeSlots(input.slots);
    const leadMinutes = input.minimumLeadMinutes ?? this.DEFAULT_MIN_LEAD_MINUTES;

    // Converte `now` para DateTime normalizado (segundos e ms zerados)
    let currentNow: DateTime;
    if (input.now instanceof DateTime) {
      currentNow = input.now.setZone(tz);
    } else if (input.now instanceof Date) {
      currentNow = DateTime.fromJSDate(input.now, { zone: tz });
    } else if (typeof input.now === 'string') {
      currentNow = DateTime.fromISO(input.now, { zone: tz });
    } else {
      currentNow = DateTime.now().setZone(tz);
    }

    if (!currentNow.isValid) {
      throw new Error(`Data atual inválida informada ao Scheduler: ${currentNow.invalidExplanation}`);
    }

    // Normaliza segundos para cálculo preciso de margem
    currentNow = currentNow.set({ second: 0, millisecond: 0 });

    // Trata lastScheduledAt se fornecido
    let lastScheduled: DateTime | null = null;
    if (input.lastScheduledAt) {
      if (input.lastScheduledAt instanceof DateTime) {
        lastScheduled = input.lastScheduledAt.setZone(tz);
      } else if (input.lastScheduledAt instanceof Date) {
        lastScheduled = DateTime.fromJSDate(input.lastScheduledAt, { zone: tz });
      } else if (typeof input.lastScheduledAt === 'string') {
        lastScheduled = DateTime.fromISO(input.lastScheduledAt, { zone: tz });
      }

      if (lastScheduled && !lastScheduled.isValid) {
        throw new Error(`Data de último agendamento inválida: ${lastScheduled.invalidExplanation}`);
      }

      if (lastScheduled) {
        lastScheduled = lastScheduled.set({ second: 0, millisecond: 0 });
      }
    }

    const scheduledTimes: DateTime[] = [];

    // Se já existem vídeos agendados no futuro, o cursor começa do último agendamento
    // e os slots subsequentes devem ser estritamente maiores (> lastScheduledAt)
    let cursor: DateTime;
    let isFirstVideoUsingLeadTime = false;

    if (lastScheduled && lastScheduled > currentNow) {
      cursor = lastScheduled;
      isFirstVideoUsingLeadTime = false;
    } else {
      // Sem agendamentos futuros: cursor = now + minimumLeadMinutes
      cursor = currentNow.plus({ minutes: leadMinutes });
      isFirstVideoUsingLeadTime = true;
    }

    // Inicia a busca a partir do dia do cursor
    let day = cursor.startOf('day');

    while (scheduledTimes.length < videoCount) {
      for (const slot of slots) {
        const candidate = day.set({
          hour: slot.hour,
          minute: slot.minute,
          second: 0,
          millisecond: 0,
        });

        if (isFirstVideoUsingLeadTime) {
          // No primeiro vídeo quando não há agendamentos, o horário é válido se slot >= now + leadMinutes
          if (candidate >= cursor) {
            scheduledTimes.push(candidate);
            cursor = candidate;
            isFirstVideoUsingLeadTime = false; // Os vídeos subsequentes usarão candidate > cursor
            if (scheduledTimes.length === videoCount) break;
          }
        } else {
          // Quando encadeando a partir de um agendamento prévio, o próximo deve ser estritamente posterior
          if (candidate > cursor) {
            scheduledTimes.push(candidate);
            cursor = candidate;
            if (scheduledTimes.length === videoCount) break;
          }
        }
      }

      // Avança para o dia seguinte
      day = day.plus({ days: 1 });
    }

    return scheduledTimes;
  }

  /**
   * Converte a lista de DateTimes para o formato DTO de resposta de prévia
   */
  public static formatPreview(
    dates: DateTime[],
    timezone: string,
    lastScheduledAt: string | null
  ): SchedulePreviewResponse {
    const items: SchedulePreviewItem[] = dates.map((dt, idx) => ({
      videoIndex: idx + 1,
      scheduledAt: dt.toUTC().toISO()!,
      formattedLocal: dt.toFormat('dd/MM/yyyy HH:mm'),
      slotTime: dt.toFormat('HH:mm'),
    }));

    return {
      items,
      timezone,
      lastScheduledAt,
    };
  }
}
