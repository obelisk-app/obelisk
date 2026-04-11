-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedByPubkey" TEXT;

-- CreateIndex
CREATE INDEX "Message_channelId_pinnedAt_idx" ON "Message"("channelId", "pinnedAt");
