-- AlterTable: Server — WoT + invite credit policy
ALTER TABLE "Server" ADD COLUMN     "referentePubkey" TEXT,
ADD COLUMN     "wotEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referenteFetchedAt" TIMESTAMP(3),
ADD COLUMN     "minDaysActive" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "minMessages" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "invitesPerUser" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "inviteExpiryHours" INTEGER NOT NULL DEFAULT 168;

-- AlterTable: Member — activity timestamp for credit eligibility
ALTER TABLE "Member" ADD COLUMN     "lastActivityAt" TIMESTAMP(3);

-- CreateTable: WotEntry — cached referente follow list
CREATE TABLE "WotEntry" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WotEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WotEntry_serverId_pubkey_key" ON "WotEntry"("serverId", "pubkey");
CREATE INDEX "WotEntry_serverId_idx" ON "WotEntry"("serverId");
CREATE INDEX "WotEntry_pubkey_idx" ON "WotEntry"("pubkey");

-- AddForeignKey
ALTER TABLE "WotEntry" ADD CONSTRAINT "WotEntry_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: WotOverride — manual whitelist
CREATE TABLE "WotOverride" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WotOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WotOverride_serverId_pubkey_key" ON "WotOverride"("serverId", "pubkey");
CREATE INDEX "WotOverride_serverId_idx" ON "WotOverride"("serverId");

-- AddForeignKey
ALTER TABLE "WotOverride" ADD CONSTRAINT "WotOverride_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
