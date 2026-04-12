-- CreateTable
CREATE TABLE "ServerGif" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '',
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerGif_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerGif_serverId_idx" ON "ServerGif"("serverId");

-- CreateIndex
CREATE INDEX "ServerGif_serverId_createdAt_idx" ON "ServerGif"("serverId", "createdAt");

-- AddForeignKey
ALTER TABLE "ServerGif" ADD CONSTRAINT "ServerGif_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
