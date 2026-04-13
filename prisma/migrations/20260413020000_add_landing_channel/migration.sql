-- Landing channel: separate from welcomeChannelId. New members land here on
-- their first /chat load; subsequent loads follow the default channel pick.
ALTER TABLE "Server" ADD COLUMN "landingChannelId" TEXT;

CREATE UNIQUE INDEX "Server_landingChannelId_key" ON "Server"("landingChannelId");

ALTER TABLE "Server" ADD CONSTRAINT "Server_landingChannelId_fkey"
    FOREIGN KEY ("landingChannelId") REFERENCES "Channel"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Per-member first-visit marker. Existing members are backfilled to true so
-- they aren't redirected to a newly-configured landing channel on their next
-- chat load (the feature targets brand-new joiners only).
ALTER TABLE "Member" ADD COLUMN "hasEnteredChat" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Member" SET "hasEnteredChat" = true;
