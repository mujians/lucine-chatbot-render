-- AlterTable: Add displayName, avatar, and specialization to Operator
ALTER TABLE "Operator" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "Operator" ADD COLUMN IF NOT EXISTS "avatar" TEXT;
ALTER TABLE "Operator" ADD COLUMN IF NOT EXISTS "specialization" TEXT;
