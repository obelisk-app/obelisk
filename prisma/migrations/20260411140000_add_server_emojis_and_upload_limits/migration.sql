-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "maxImageBytes" INTEGER NOT NULL DEFAULT 10485760,
ADD COLUMN     "maxVideoBytes" INTEGER NOT NULL DEFAULT 52428800,
ADD COLUMN     "maxDocBytes" INTEGER NOT NULL DEFAULT 26214400,
ADD COLUMN     "maxAudioBytes" INTEGER NOT NULL DEFAULT 26214400,
ADD COLUMN     "allowedMimeTypes" TEXT;

-- CreateTable
CREATE TABLE "ServerEmoji" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerEmoji_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerEmoji_serverId_idx" ON "ServerEmoji"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerEmoji_serverId_name_key" ON "ServerEmoji"("serverId", "name");

-- AddForeignKey
ALTER TABLE "ServerEmoji" ADD CONSTRAINT "ServerEmoji_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
