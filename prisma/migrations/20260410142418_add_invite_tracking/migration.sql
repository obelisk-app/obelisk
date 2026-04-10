-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "joinedViaInviteId" TEXT;

-- CreateIndex
CREATE INDEX "Member_joinedViaInviteId_idx" ON "Member"("joinedViaInviteId");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_joinedViaInviteId_fkey" FOREIGN KEY ("joinedViaInviteId") REFERENCES "Invitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
