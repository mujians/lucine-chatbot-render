-- Add missing category column to SLARecord
ALTER TABLE "SLARecord" 
ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'GENERAL';

-- Update existing records
UPDATE "SLARecord" SET "category" = 'GENERAL' WHERE "category" IS NULL;
