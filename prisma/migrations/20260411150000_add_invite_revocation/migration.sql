-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedBy" TEXT;
