#!/usr/bin/env node

/**
 * FORCE Migration Reset - Nuclear option
 * Deletes ALL failed migration records to allow fresh start
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function forceReset() {
  console.log('🔧 FORCE RESET: Removing ALL failed migrations...');

  try {
    // Delete ANY failed migrations
    const result = await prisma.$executeRawUnsafe(`
      DELETE FROM "_prisma_migrations"
      WHERE "finished_at" IS NULL
      OR "rolled_back_at" IS NOT NULL
    `);

    console.log(`✅ Removed ${result} failed/rolled-back migration records`);

    await prisma.$disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    // Don't fail build if table doesn't exist yet
    await prisma.$disconnect();
    process.exit(0);
  }
}

forceReset();
