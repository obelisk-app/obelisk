-- CreateTable
CREATE TABLE "CustomRole" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#99aab5',
    "icon" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "permissions" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberCustomRole" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "MemberCustomRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomRole_serverId_name_key" ON "CustomRole"("serverId", "name");

-- CreateIndex
CREATE INDEX "CustomRole_serverId_idx" ON "CustomRole"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberCustomRole_memberId_roleId_key" ON "MemberCustomRole"("memberId", "roleId");

-- CreateIndex
CREATE INDEX "MemberCustomRole_memberId_idx" ON "MemberCustomRole"("memberId");

-- CreateIndex
CREATE INDEX "MemberCustomRole_roleId_idx" ON "MemberCustomRole"("roleId");

-- AddForeignKey
ALTER TABLE "CustomRole" ADD CONSTRAINT "CustomRole_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCustomRole" ADD CONSTRAINT "MemberCustomRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberCustomRole" ADD CONSTRAINT "MemberCustomRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "CustomRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
