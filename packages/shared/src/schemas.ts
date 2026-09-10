import { z } from 'zod';

export const ScheduleSlotInputSchema = z.object({
  videoCount: z.number().int().positive('Quantidade de vídeos deve ser no mínimo 1'),
  slots: z.array(z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Formato de horário deve ser HH:mm')).min(1, 'Defina ao menos um horário'),
  timezone: z.string().default('America/Recife'),
  minimumLeadMinutes: z.number().int().min(0).default(10),
  useLastScheduled: z.boolean().default(true),
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
  lastSyncedAt: z.string().nullable().optional(),
});

export const UploadProfileInputSchema = z.object({
  name: z.string().min(1, 'Nome do perfil é obrigatório'),
  isDefault: z.boolean().default(false),
  defaultDescription: z.string().optional().nullable(),
  defaultTags: z.array(z.string()).default([]),
  categoryId: z.string().optional().nullable(),
  defaultLanguage: z.string().default('pt'),
  madeForKids: z.boolean().default(false),
  containsSyntheticMedia: z.boolean().default(false),
  license: z.string().default('youtube'),
  embeddable: z.boolean().default(true),
  publicStatsViewable: z.boolean().default(true),
  playlistId: z.string().optional().nullable(),
  notifySubscribers: z.boolean().default(true),
});
