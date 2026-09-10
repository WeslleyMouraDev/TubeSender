import { z } from 'zod';

export const ScheduleSlotInputSchema = z.object({
  videoCount: z.number().int().positive('Quantidade de vídeos deve ser no mínimo 1'),
  slots: z.array(z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato de horário deve ser HH:mm')).min(1, 'Defina ao menos um horário'),
  timezone: z.string().default('America/Recife'),
  minimumLeadMinutes: z.number().int().min(0).default(10),
});

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  database: z.enum(['ok', 'error']),
  youtubeAuth: z.enum(['connected', 'disconnected']).optional(),
  timestamp: z.string(),
});

export const ChannelSummarySchema = z.object({
  id: z.string(),
  youtubeChannelId: z.string(),
  title: z.string(),
  thumbnailUrl: z.string().nullable(),
  uploadsPlaylistId: z.string().nullable(),
});

export const OAuthStatusResponseSchema = z.object({
  connected: z.boolean(),
  channel: ChannelSummarySchema.optional(),
  expiresAt: z.string().nullable().optional(),
});

export const DashboardDataSchema = z.object({
  channel: ChannelSummarySchema.nullable(),
  counts: z.object({
    published: z.number().int().min(0),
    scheduled: z.number().int().min(0),
    private: z.number().int().min(0),
    drafts: z.number().int().min(0),
  }),
  nextScheduled: z
    .object({
      videoId: z.string(),
      title: z.string(),
      thumbnailUrl: z.string().nullable(),
      publishAt: z.string(),
    })
    .nullable(),
  lastScheduled: z
    .object({
      videoId: z.string(),
      title: z.string(),
      publishAt: z.string(),
    })
    .nullable(),
});

