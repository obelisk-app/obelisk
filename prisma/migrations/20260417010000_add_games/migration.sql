-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "minPlayers" INTEGER NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "turnTimeoutS" INTEGER NOT NULL DEFAULT 30,
    "currentTurn" TEXT,
    "turnDeadline" TIMESTAMP(3),
    "state" JSONB NOT NULL,
    "winnerPubkey" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameParticipant" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'joined',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Game_serverId_status_idx" ON "Game"("serverId", "status");

-- CreateIndex
CREATE INDEX "Game_channelId_idx" ON "Game"("channelId");

-- CreateIndex
CREATE INDEX "GameParticipant_gameId_idx" ON "GameParticipant"("gameId");

-- CreateIndex
CREATE INDEX "GameParticipant_pubkey_idx" ON "GameParticipant"("pubkey");

-- CreateIndex
CREATE UNIQUE INDEX "GameParticipant_gameId_pubkey_key" ON "GameParticipant"("gameId", "pubkey");

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
