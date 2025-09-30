/**
 * 🔧 Script per assicurarsi che tutte le tabelle esistano
 * Crea tabelle mancanti nel database di produzione
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function ensureTables() {
    console.log('🔧 Checking and creating missing database tables...');
    
    try {
        // Query SQL per creare le tabelle se non esistono
        const createQueueEntryTable = `
            CREATE TABLE IF NOT EXISTS "QueueEntry" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "sessionId" TEXT NOT NULL UNIQUE,
                "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
                "requiredSkills" TEXT[],
                "status" "QueueStatus" NOT NULL DEFAULT 'WAITING',
                "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "assignedAt" TIMESTAMP(3),
                "cancelledAt" TIMESTAMP(3),
                "assignedTo" TEXT,
                "cancelReason" TEXT,
                "estimatedWaitTime" INTEGER NOT NULL,
                "slaWarningNotified" BOOLEAN NOT NULL DEFAULT false,
                "slaViolationNotified" BOOLEAN NOT NULL DEFAULT false,
                CONSTRAINT "QueueEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("sessionId") ON DELETE RESTRICT ON UPDATE CASCADE,
                CONSTRAINT "QueueEntry_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "Operator" ("id") ON DELETE SET NULL ON UPDATE CASCADE
            );`;

        const createSLARecordTable = `
            CREATE TABLE IF NOT EXISTS "SLARecord" (
                "id" TEXT NOT NULL PRIMARY KEY,
                "entityId" TEXT NOT NULL,
                "entityType" TEXT NOT NULL,
                "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "responseDeadline" TIMESTAMP(3) NOT NULL,
                "resolutionDeadline" TIMESTAMP(3) NOT NULL,
                "firstResponseAt" TIMESTAMP(3),
                "resolvedAt" TIMESTAMP(3),
                "status" "SLAStatus" NOT NULL DEFAULT 'ACTIVE',
                "violatedAt" TIMESTAMP(3),
                "escalatedAt" TIMESTAMP(3)
            );`;

        // Crea gli enums se non esistono
        const createQueueStatusEnum = `
            DO $$ BEGIN
                CREATE TYPE "QueueStatus" AS ENUM ('WAITING', 'ASSIGNED', 'CANCELLED', 'TIMEOUT');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;`;

        const createSLAStatusEnum = `
            DO $$ BEGIN
                CREATE TYPE "SLAStatus" AS ENUM ('ACTIVE', 'RESPONSE_MET', 'RESOLUTION_MET', 'VIOLATED', 'ESCALATED');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;`;

        // Array di query per gli indici (una per volta)
        const indexQueries = [
            `CREATE INDEX IF NOT EXISTS "QueueEntry_status_priority_enteredAt_idx" ON "QueueEntry"("status", "priority", "enteredAt");`,
            `CREATE INDEX IF NOT EXISTS "QueueEntry_enteredAt_idx" ON "QueueEntry"("enteredAt");`,
            `CREATE INDEX IF NOT EXISTS "QueueEntry_assignedTo_idx" ON "QueueEntry"("assignedTo");`,
            `CREATE INDEX IF NOT EXISTS "SLARecord_entityId_entityType_idx" ON "SLARecord"("entityId", "entityType");`,
            `CREATE INDEX IF NOT EXISTS "SLARecord_status_responseDeadline_idx" ON "SLARecord"("status", "responseDeadline");`,
            `CREATE INDEX IF NOT EXISTS "SLARecord_status_resolutionDeadline_idx" ON "SLARecord"("status", "resolutionDeadline");`
        ];

        // Esegui le query una per volta
        await prisma.$executeRawUnsafe(createQueueStatusEnum);
        console.log('✅ QueueStatus enum created/verified');

        await prisma.$executeRawUnsafe(createSLAStatusEnum);
        console.log('✅ SLAStatus enum created/verified');

        await prisma.$executeRawUnsafe(createQueueEntryTable);
        console.log('✅ QueueEntry table created/verified');

        await prisma.$executeRawUnsafe(createSLARecordTable);
        console.log('✅ SLARecord table created/verified');

        // Crea gli indici uno per volta
        for (const indexQuery of indexQueries) {
            await prisma.$executeRawUnsafe(indexQuery);
        }
        console.log('✅ Database indices created/verified');

        console.log('🎉 All database tables are ready!');
        return true;
        
    } catch (error) {
        console.error('❌ Failed to ensure tables:', error);
        throw error;
    }
}

export { ensureTables };