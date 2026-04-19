-- Phase 1: additive schema for Discord/Slack-style notification system.
-- No existing tables are dropped or renamed. Safe to roll forward on prod.

-- 1. Denormalize Channel.lastMessageAt so unread aggregation doesn't
--    COUNT(Message) on every sidebar render.
ALTER TABLE "Channel" ADD COLUMN "lastMessageAt" TIMESTAMP(3);

-- Backfill from existing messages. Channels with no messages stay NULL.
UPDATE "Channel" c
SET "lastMessageAt" = sub.max_created
FROM (
  SELECT "channelId", MAX("createdAt") AS max_created
  FROM "Message"
  GROUP BY "channelId"
) sub
WHERE c.id = sub."channelId";

CREATE INDEX "Channel_serverId_lastMessageAt_idx" ON "Channel"("serverId", "lastMessageAt");

-- Trigger keeps Channel.lastMessageAt in sync with Message inserts without
-- requiring every call-site (server.ts, REST routes, seed, welcome, etc.)
-- to remember to bump it. Runs per-row; negligible overhead vs. an index
-- scan on every sidebar render.
CREATE OR REPLACE FUNCTION bump_channel_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "Channel"
  SET "lastMessageAt" = NEW."createdAt"
  WHERE id = NEW."channelId"
    AND ("lastMessageAt" IS NULL OR "lastMessageAt" < NEW."createdAt");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER message_bump_channel_last_message_at
  AFTER INSERT ON "Message"
  FOR EACH ROW
  EXECUTE FUNCTION bump_channel_last_message_at();

-- 2. NotificationPreference: per-user per-scope notify level + mute.
CREATE TABLE "NotificationPreference" (
  "id"          TEXT NOT NULL,
  "pubkey"      TEXT NOT NULL,
  "scopeType"   TEXT NOT NULL,
  "scopeId"     TEXT NOT NULL,
  "notifyLevel" TEXT,
  "mutedUntil"  TIMESTAMP(3),
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationPreference_pubkey_scopeType_scopeId_key"
  ON "NotificationPreference"("pubkey", "scopeType", "scopeId");
CREATE INDEX "NotificationPreference_pubkey_idx"
  ON "NotificationPreference"("pubkey");
CREATE INDEX "NotificationPreference_scopeType_scopeId_idx"
  ON "NotificationPreference"("scopeType", "scopeId");

-- 3. InboxItem: persisted notification feed (replaces session-only store).
CREATE TABLE "InboxItem" (
  "id"              TEXT NOT NULL,
  "recipientPubkey" TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "serverId"        TEXT,
  "channelId"       TEXT,
  "messageId"       TEXT,
  "postId"          TEXT,
  "senderPubkey"    TEXT NOT NULL,
  "preview"         TEXT NOT NULL,
  "readAt"          TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InboxItem_recipientPubkey_createdAt_idx"
  ON "InboxItem"("recipientPubkey", "createdAt");
CREATE INDEX "InboxItem_recipientPubkey_readAt_idx"
  ON "InboxItem"("recipientPubkey", "readAt");
