-- Force fix for failed 20251005_add_sla_records migration
-- This migration will be applied AFTER the failed one is marked as rolled back

-- First, clean up any partial objects that might exist
DROP TABLE IF EXISTS "SLARecord" CASCADE;
DROP TYPE IF EXISTS "SLAType" CASCADE;
DROP TYPE IF EXISTS "SLARecordStatus" CASCADE;

-- Now create everything correctly
CREATE TYPE "SLAType" AS ENUM ('RESPONSE_TIME', 'INACTIVITY_TIMEOUT', 'RESOLUTION_TIME', 'QUEUE_WAIT');
CREATE TYPE "SLARecordStatus" AS ENUM ('OK', 'WARNING', 'VIOLATED');

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

CREATE INDEX "SLAMonitoringRecord_sessionId_idx" ON "SLAMonitoringRecord"("sessionId");
CREATE INDEX "SLAMonitoringRecord_ticketId_idx" ON "SLAMonitoringRecord"("ticketId");
CREATE INDEX "SLAMonitoringRecord_type_status_idx" ON "SLAMonitoringRecord"("type", "status");
CREATE INDEX "SLAMonitoringRecord_triggeredAt_idx" ON "SLAMonitoringRecord"("triggeredAt");

ALTER TABLE "SLAMonitoringRecord" ADD CONSTRAINT "SLAMonitoringRecord_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
