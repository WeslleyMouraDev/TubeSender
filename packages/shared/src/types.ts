export type UploadJobStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'SETTING_THUMBNAIL'
  | 'ADDING_PLAYLIST'
  | 'VERIFYING'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'FAILED'
  | 'CANCELED'
  | 'PAUSED';

export type BatchStatus =
  | 'DRAFT'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'CANCELED'
  | 'FAILED';

export type VideoPrivacyStatus = 'public' | 'private' | 'unlisted';

export interface HealthResponse {
  status: 'ok' | 'error';
  database: 'ok' | 'error';
  youtubeAuth?: 'connected' | 'disconnected';
  timestamp: string;
}

export interface ScheduleSlotInput {
  videoCount: number;
  slots: string[]; // Ex: ["12:00", "21:00"]
  timezone?: string; // Padrão: America/Recife
  minimumLeadMinutes?: number; // Padrão: 10
}

export interface ChannelSummary {
  id: string;
  youtubeChannelId: string;
  title: string;
  thumbnailUrl: string | null;
  uploadsPlaylistId: string | null;
}

export interface OAuthStatusResponse {
  connected: boolean;
  channel?: ChannelSummary;
  expiresAt?: string | null;
}

export interface DashboardData {
  channel: ChannelSummary | null;
  counts: {
    published: number;
    scheduled: number;
    private: number;
    drafts: number;
  };
  nextScheduled: {
    videoId: string;
    title: string;
    thumbnailUrl: string | null;
    publishAt: string;
  } | null;
  lastScheduled: {
    videoId: string;
    title: string;
    publishAt: string;
  } | null;
}

