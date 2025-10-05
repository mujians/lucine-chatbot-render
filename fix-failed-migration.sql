-- Fix failed migration 20251005_add_sla_records
-- This script manually completes the migration and marks it as successful

-- 1. Drop any partially created objects from failed migration
DROP TABLE IF EXISTS "SLARecord" CASCADE;
DROP TYPE IF EXISTS "SLAStatus" CASCADE;
DROP TYPE IF EXISTS "SLAType" CASCADE;

-- 2. Create the correct enums
CREATE TYPE "SLAType" AS ENUM ('RESPONSE_TIME', 'INACTIVITY_TIMEOUT', 'RESOLUTION_TIME', 'QUEUE_WAIT');
CREATE TYPE "SLARecordStatus" AS ENUM ('OK', 'WARNING', 'VIOLATED');

-- 3. Create the correct table
CREATE TABLE "SLAMonitoringRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "ticketId" TEXT,
    "type" "SLAType" NOT NULL,
    "limitSeconds" INTEGER NOT NULL,
    "actualSeconds" INTEGER,
    "status" "SLARecordStatus" NOT NULL DEFAULT 'OK',
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "violatedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SLAMonitoringRecord_pkey" PRIMARY KEY ("id")
);

-- 4. Create indexes
CREATE INDEX "SLAMonitoringRecord_sessionId_idx" ON "SLAMonitoringRecord"("sessionId");
CREATE INDEX "SLAMonitoringRecord_ticketId_idx" ON "SLAMonitoringRecord"("ticketId");
CREATE INDEX "SLAMonitoringRecord_type_status_idx" ON "SLAMonitoringRecord"("type", "status");
CREATE INDEX "SLAMonitoringRecord_triggeredAt_idx" ON "SLAMonitoringRecord"("triggeredAt");

-- 5. Add foreign key
ALTER TABLE "SLAMonitoringRecord" ADD CONSTRAINT "SLAMonitoringRecord_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Mark the failed migration as rolled back and update migration record
-- This allows Prisma to re-run it successfully
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20251005_add_sla_records';
