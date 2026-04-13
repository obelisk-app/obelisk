-- Prebuilt per-server bots shown as pseudo-members in the right sidebar.
CREATE TABLE "ServerBot" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "lastValue" TEXT,
    "lastFetchAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerBot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServerBot_serverId_type_key" ON "ServerBot"("serverId", "type");
CREATE INDEX "ServerBot_serverId_idx" ON "ServerBot"("serverId");

ALTER TABLE "ServerBot" ADD CONSTRAINT "ServerBot_serverId_fkey"
    FOREIGN KEY ("serverId") REFERENCES "Server"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
