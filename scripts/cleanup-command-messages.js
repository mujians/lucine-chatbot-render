#!/usr/bin/env node

/**
 * 🧹 CLEANUP COMMAND MESSAGES
 * Rimuove messaggi di comando tecnici dallo storico
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COMMAND_MESSAGES = [
  'request_operator',
  'continue_chat',
  'end_chat',
  'apri ticket',
  'continua con assistente AI',
  'resume_with_ai',
  'resume_with_operator',
  'wait_in_queue',
  'request_ticket',
  'open_ticket',
  'continue_ai'
];

async function cleanupCommandMessages() {
  console.log('🧹 Starting cleanup of command messages...\n');

  try {
    // 1. Find all command messages
    const allMessages = await prisma.message.findMany({
      where: {
        message: { in: COMMAND_MESSAGES }
      },
      select: {
        id: true,
        message: true,
        sender: true,
        sessionId: true,
        timestamp: true,
        metadata: true
      }
    });

    // Also find messages with command metadata
    const commandTypeMessages = await prisma.message.findMany({
      where: {
        metadata: {
          path: ['type'],
          equals: 'command'
        }
      },
      select: {
        id: true,
        message: true,
        sender: true,
        sessionId: true,
        timestamp: true,
        metadata: true
      }
    });

    // Merge and deduplicate
    const commandMessagesMap = new Map();
    [...allMessages, ...commandTypeMessages].forEach(msg => {
      commandMessagesMap.set(msg.id, msg);
    });

    const commandMessages = Array.from(commandMessagesMap.values());

    console.log(`📊 Found ${commandMessages.length} command messages to clean up\n`);

    if (commandMessages.length === 0) {
      console.log('✅ No command messages to clean up!');
      await prisma.$disconnect();
      process.exit(0);
    }

    // Group by type for reporting
    const byType = {};
    commandMessages.forEach(msg => {
      const key = msg.metadata?.type || msg.message;
      byType[key] = (byType[key] || 0) + 1;
    });

    console.log('📋 Command messages by type:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });
    console.log('');

    // 2. Delete command messages
    const deleteResult = await prisma.message.deleteMany({
      where: {
        id: {
          in: commandMessages.map(m => m.id)
        }
      }
    });

    console.log(`✅ Deleted ${deleteResult.count} command messages\n`);

    // 3. Update remaining messages with metadata if needed
    console.log('🔄 Checking for messages that need metadata updates...\n');

    const messagesToUpdate = await prisma.message.findMany({
      where: {
        metadata: null,
        sender: 'SYSTEM'
      }
    });

    let updated = 0;
    for (const msg of messagesToUpdate) {
      let context = null;

      if (msg.message.includes('si è unito alla chat')) {
        context = 'operator_joined';
      } else if (msg.message.includes('ha lasciato la chat')) {
        context = 'operator_left';
      } else if (msg.message.includes('Chat chiusa')) {
        context = 'session_closed';
      }

      if (context) {
        await prisma.message.update({
          where: { id: msg.id },
          data: {
            metadata: {
              type: 'system',
              context,
              updatedBy: 'cleanup-script'
            }
          }
        });
        updated++;
      }
    }

    console.log(`✅ Updated ${updated} system messages with metadata\n`);

    // 4. Stats
    const totalMessages = await prisma.message.count();
    const userMessages = await prisma.message.count({
      where: { sender: 'USER' }
    });
    const aiMessages = await prisma.message.count({
      where: { sender: 'AI' }
    });
    const operatorMessages = await prisma.message.count({
      where: { sender: 'OPERATOR' }
    });
    const systemMessages = await prisma.message.count({
      where: { sender: 'SYSTEM' }
    });

    console.log('📊 Final message statistics:');
    console.log(`   Total messages: ${totalMessages}`);
    console.log(`   - USER: ${userMessages}`);
    console.log(`   - AI: ${aiMessages}`);
    console.log(`   - OPERATOR: ${operatorMessages}`);
    console.log(`   - SYSTEM: ${systemMessages}`);

    await prisma.$disconnect();
    console.log('\n✅ Cleanup completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

cleanupCommandMessages();
