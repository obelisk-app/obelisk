-- CreateTable
CREATE TABLE "InstanceSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "defaultServerId" TEXT,

    CONSTRAINT "InstanceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstanceSettings_defaultServerId_key" ON "InstanceSettings"("defaultServerId");

-- AddForeignKey
ALTER TABLE "InstanceSettings" ADD CONSTRAINT "InstanceSettings_defaultServerId_fkey" FOREIGN KEY ("defaultServerId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;
