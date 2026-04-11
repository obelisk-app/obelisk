-- AlterTable
ALTER TABLE "Server" ADD COLUMN     "welcomeChannelId" TEXT,
ADD COLUMN     "welcomeLocale" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Server_welcomeChannelId_key" ON "Server"("welcomeChannelId");

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_welcomeChannelId_fkey" FOREIGN KEY ("welcomeChannelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
