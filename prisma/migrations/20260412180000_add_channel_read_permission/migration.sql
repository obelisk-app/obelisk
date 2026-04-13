-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "readPermission" TEXT,
ADD COLUMN "readRoleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
