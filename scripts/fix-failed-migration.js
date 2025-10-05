#!/usr/bin/env node

/**
 * Fix Failed Migration Script
 * Resolves the failed 20251005_add_sla_records migration
 * Run this BEFORE prisma migrate deploy
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixFailedMigration() {
  console.log('🔧 Checking for failed migration...');

  try {
    // Check if migration is marked as failed
    const failedMigration = await prisma.$queryRawUnsafe(`
      SELECT * FROM "_prisma_migrations"
      WHERE "migration_name" = '20251005_add_sla_records'
      AND "finished_at" IS NULL
    `);

    if (failedMigration.length === 0) {
      console.log('✅ No failed migration found. Proceeding normally.');
      await prisma.$disconnect();
      process.exit(0);
    }

    console.log('⚠️ Found failed migration. Fixing...');

    // Drop any partial objects from failed migration
    console.log('🗑️ Cleaning up partial migration artifacts...');

    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "SLARecord" CASCADE`);
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "SLAType" CASCADE`);

    // Don't drop SLAStatus - it's the legacy enum that should exist
    // Just drop SLARecordStatus if it exists
    await prisma.$executeRawUnsafe(`DROP TYPE IF EXISTS "SLARecordStatus" CASCADE`);

    // Delete the failed migration record so Prisma can retry
    console.log('🔄 Removing failed migration record...');
    await prisma.$executeRawUnsafe(`
      DELETE FROM "_prisma_migrations"
      WHERE "migration_name" = '20251005_add_sla_records'
    `);

    console.log('✅ Failed migration cleaned up. Prisma can now retry.');
    await prisma.$disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error fixing migration:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

fixFailedMigration();
