-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "writeRoleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
