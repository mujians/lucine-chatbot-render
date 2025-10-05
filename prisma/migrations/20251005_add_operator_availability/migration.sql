-- Add AvailabilityStatus enum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'BUSY', 'AWAY', 'OFFLINE');

-- Add availabilityStatus column to Operator table with default AVAILABLE
ALTER TABLE "Operator" ADD COLUMN "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE';

-- Update existing operators to AVAILABLE status
UPDATE "Operator" SET "availabilityStatus" = 'AVAILABLE' WHERE "isOnline" = true;
UPDATE "Operator" SET "availabilityStatus" = 'OFFLINE' WHERE "isOnline" = false;
