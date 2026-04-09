-- CreateTable
CREATE TABLE "ChannelReadState" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadMessageId" TEXT,

    CONSTRAINT "ChannelReadState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DMReadState" (
    "id" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "threadPubkey" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DMReadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelReadState_pubkey_idx" ON "ChannelReadState"("pubkey");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelReadState_channelId_pubkey_key" ON "ChannelReadState"("channelId", "pubkey");

-- CreateIndex
CREATE INDEX "Mention_pubkey_createdAt_idx" ON "Mention"("pubkey", "createdAt");

-- CreateIndex
CREATE INDEX "Mention_channelId_pubkey_idx" ON "Mention"("channelId", "pubkey");

-- CreateIndex
CREATE UNIQUE INDEX "Mention_messageId_pubkey_key" ON "Mention"("messageId", "pubkey");

-- CreateIndex
CREATE UNIQUE INDEX "DMReadState_pubkey_threadPubkey_key" ON "DMReadState"("pubkey", "threadPubkey");

-- AddForeignKey
ALTER TABLE "ChannelReadState" ADD CONSTRAINT "ChannelReadState_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
