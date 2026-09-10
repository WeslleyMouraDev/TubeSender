-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "youtubeChannelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "uploadsPlaylistId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "scope" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OAuthAccount_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "lastSyncedAt" DATETIME,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncedVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "privacyStatus" TEXT NOT NULL,
    "publishAt" DATETIME,
    "publishedAt" DATETIME,
    "thumbnails" TEXT,
    "tags" TEXT,
    "categoryId" TEXT,
    "madeForKids" BOOLEAN DEFAULT false,
    "containsSyntheticMedia" BOOLEAN DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SyncedVideo_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalVideos" INTEGER NOT NULL DEFAULT 0,
    "completedVideos" INTEGER NOT NULL DEFAULT 0,
    "failedVideos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VideoDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "localPath" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileSize" BIGINT,
    "title" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "scheduledAt" DATETIME,
    "customDescription" TEXT,
    "customTags" TEXT,
    "thumbnailPath" TEXT,
    "playlistId" TEXT,
    "youtubeVideoId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VideoDraft_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UploadProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "defaultDescription" TEXT,
    "defaultTags" TEXT,
    "categoryId" TEXT,
    "defaultLanguage" TEXT DEFAULT 'pt',
    "madeForKids" BOOLEAN NOT NULL DEFAULT false,
    "containsSyntheticMedia" BOOLEAN NOT NULL DEFAULT false,
    "license" TEXT DEFAULT 'youtube',
    "embeddable" BOOLEAN NOT NULL DEFAULT true,
    "publicStatsViewable" BOOLEAN NOT NULL DEFAULT true,
    "playlistId" TEXT,
    "notifySubscribers" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UploadProfile_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OperationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_youtubeChannelId_key" ON "Channel"("youtubeChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_channelId_key" ON "OAuthAccount"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_channelId_key" ON "SyncState"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncedVideo_youtubeVideoId_key" ON "SyncedVideo"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "SyncedVideo_channelId_publishAt_idx" ON "SyncedVideo"("channelId", "publishAt");

-- CreateIndex
CREATE INDEX "SyncedVideo_privacyStatus_idx" ON "SyncedVideo"("privacyStatus");

-- CreateIndex
CREATE INDEX "VideoDraft_batchId_orderIndex_idx" ON "VideoDraft"("batchId", "orderIndex");

-- CreateIndex
CREATE INDEX "VideoDraft_youtubeVideoId_idx" ON "VideoDraft"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "OperationLog_level_createdAt_idx" ON "OperationLog"("level", "createdAt");

-- CreateIndex
CREATE INDEX "OperationLog_category_idx" ON "OperationLog"("category");
