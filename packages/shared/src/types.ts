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
  useLastScheduled?: boolean;
}

export interface SchedulePreviewItem {
  videoIndex: number;
  scheduledAt: string;
  formattedLocal: string;
  slotTime: string;
}

export interface SchedulePreviewResponse {
  items: SchedulePreviewItem[];
  timezone: string;
  lastScheduledAt: string | null;
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
  lastSyncedAt?: string | null;
}

export interface SyncedVideoDTO {
  id: string;
  channelId: string;
  youtubeVideoId: string;
  title: string;
  description?: string | null;
  privacyStatus: VideoPrivacyStatus;
  publishAt?: string | null;
  publishedAt?: string | null;
  thumbnails?: Record<string, { url: string; width?: number; height?: number }> | null;
  tags?: string[];
  categoryId?: string | null;
  madeForKids?: boolean | null;
  containsSyntheticMedia?: boolean | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface VideoDraftDTO {
  id: string;
  batchId: string;
  localPath: string;
  filename: string;
  fileSize?: number | null;
  title: string;
  orderIndex: number;
  scheduledAt?: string | null;
  customDescription?: string | null;
  customTags?: string[];
  thumbnailPath?: string | null;
  playlistId?: string | null;
  youtubeVideoId?: string | null;
  status: UploadJobStatus;
  errorMessage?: string | null;
  retryCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BatchDTO {
  id: string;
  status: BatchStatus;
  totalVideos: number;
  completedVideos: number;
  failedVideos: number;
  drafts: VideoDraftDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface UploadProfileDTO {
  id: string;
  channelId?: string | null;
  name: string;
  isDefault: boolean;
  defaultDescription?: string | null;
  defaultTags?: string[];
  categoryId?: string | null;
  defaultLanguage?: string | null;
  madeForKids?: boolean | null;
  containsSyntheticMedia?: boolean | null;
  license?: string | null;
  embeddable?: boolean | null;
  publicStatsViewable?: boolean | null;
  playlistId?: string | null;
  notifySubscribers?: boolean | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OperationLogDTO {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  category: 'AUTH' | 'SYNC' | 'UPLOAD' | 'SCHEDULER' | 'SYSTEM';
  message: string;
  metadata?: Record<string, any> | null;
  createdAt: string;
}

export interface DiagnosticResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}

export type SSEEvent =
  | {
      type: 'upload.progress';
      draftId: string;
      batchId: string;
      bytesSent: number;
      totalBytes: number;
      percentage: number;
    }
  | {
      type: 'job.status';
      draftId: string;
      batchId: string;
      status: UploadJobStatus;
      youtubeVideoId?: string;
      errorMessage?: string;
    }
  | {
      type: 'batch.status';
      batchId: string;
      status: BatchStatus;
      completedVideos: number;
      failedVideos: number;
    };
