-- CreateEnum for SLA types
CREATE TYPE "SLAType" AS ENUM ('RESPONSE_TIME', 'INACTIVITY_TIMEOUT', 'RESOLUTION_TIME', 'QUEUE_WAIT');

-- CreateEnum for SLA status
CREATE TYPE "SLAStatus" AS ENUM ('OK', 'WARNING', 'VIOLATED');

-- CreateTable SLARecord
CREATE TABLE "SLARecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "ticketId" TEXT,
    "type" "SLAType" NOT NULL,
    "limitSeconds" INTEGER NOT NULL,
    "actualSeconds" INTEGER,
    "status" "SLAStatus" NOT NULL DEFAULT 'OK',
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "violatedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SLARecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SLARecord_sessionId_idx" ON "SLARecord"("sessionId");
CREATE INDEX "SLARecord_ticketId_idx" ON "SLARecord"("ticketId");
CREATE INDEX "SLARecord_type_status_idx" ON "SLARecord"("type", "status");

-- AddForeignKey
ALTER TABLE "SLARecord" ADD CONSTRAINT "SLARecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (optional, ticket might not exist)
-- Will handle NULL ticketId
