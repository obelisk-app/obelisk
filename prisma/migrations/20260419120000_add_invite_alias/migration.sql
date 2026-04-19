-- Permanent, editable invite aliases. Stateless named redirect into a
-- server's open-join flow (obelisk.ar/invite/<slug>). No uses/expiry.
CREATE TABLE "InviteAlias" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InviteAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InviteAlias_slug_key" ON "InviteAlias"("slug");
CREATE INDEX "InviteAlias_serverId_idx" ON "InviteAlias"("serverId");

ALTER TABLE "InviteAlias" ADD CONSTRAINT "InviteAlias_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
