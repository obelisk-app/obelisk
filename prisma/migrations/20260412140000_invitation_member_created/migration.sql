-- AddColumn
ALTER TABLE "Invitation" ADD COLUMN "memberCreated" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Invitation_serverId_createdBy_memberCreated_idx"
  ON "Invitation"("serverId", "createdBy", "memberCreated");
