/**
 * 📊 Queue Analytics - Statistics & Metrics
 * Gestisce metriche, posizioni e statistiche della coda
 */

import logger from '../../utils/logger.js';

export class QueueAnalytics {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Ottieni posizione in coda per sessione
   */
  async getQueuePosition(sessionId) {
    const entry = await this.prisma.queueEntry.findFirst({
      where: { sessionId, status: 'WAITING' }
    });

    if (!entry) return null;

    // Priority ranking (higher = more urgent)
    const priorityRank = {
      'URGENT': 4,
      'HIGH': 3,
      'MEDIUM': 2,
      'LOW': 1
    };

    const entryRank = priorityRank[entry.priority] || 1;

    // Get all waiting entries
    const allWaiting = await this.prisma.queueEntry.findMany({
      where: { status: 'WAITING' },
      select: {
        priority: true,
        enteredAt: true
      }
    });

    // Count how many are ahead (higher priority OR same priority but earlier)
    const position = allWaiting.filter(item => {
      const itemRank = priorityRank[item.priority] || 1;
      return itemRank > entryRank ||
             (itemRank === entryRank && item.enteredAt < entry.enteredAt);
    }).length;

    return position + 1;
  }

  /**
   * Calcola tempo di attesa stimato
   */
  async calculateEstimatedWait(priority) {
    // Count available operators (online AND not in active chat AND availabilityStatus = AVAILABLE)
    const allOnlineOperators = await this.prisma.operator.findMany({
      where: {
        isOnline: true,
        isActive: true,
        availabilityStatus: 'AVAILABLE'
      },
      select: { id: true }
    });

    if (allOnlineOperators.length === 0) {
      return 30; // 30 minutes if no operators online
    }

    // Check how many are actually available (not in active chat)
    let availableCount = 0;
    for (const op of allOnlineOperators) {
      const activeChats = await this.prisma.operatorChat.count({
        where: {
          operatorId: op.id,
          endedAt: null
        }
      });
      if (activeChats === 0) availableCount++;
    }

    // If operators available, wait should be minimal
    if (availableCount > 0) {
      return 1; // 1 minute - almost instant
    }

    // All operators busy - calculate based on queue size and busy operators
    const busyOperators = allOnlineOperators.length;
    const totalWaiting = await this.prisma.queueEntry.count({
      where: { status: 'WAITING' }
    });

    // Average 5 minutes per chat, distributed across busy operators
    const estimatedMinutes = Math.ceil((totalWaiting / busyOperators) * 5);

    return Math.min(30, Math.max(3, estimatedMinutes)); // Between 3-30 minutes
  }

  /**
   * Statistiche coda
   */
  async getQueueStats() {
    const stats = await this.prisma.queueEntry.aggregate({
      where: { status: 'WAITING' },
      _count: { id: true },
      _avg: { estimatedWaitTime: true }
    });

    const priorityBreakdown = await this.prisma.queueEntry.groupBy({
      by: ['priority'],
      where: { status: 'WAITING' },
      _count: { priority: true }
    });

    const oldestEntry = await this.prisma.queueEntry.findFirst({
      where: { status: 'WAITING' },
      orderBy: { enteredAt: 'asc' }
    });

    return {
      totalWaiting: stats._count.id || 0,
      avgWaitTime: Math.round(stats._avg.estimatedWaitTime || 0),
      longestWait: oldestEntry ? Math.round((new Date() - oldestEntry.enteredAt) / 60000) : 0,
      priorityBreakdown: priorityBreakdown.reduce((acc, item) => {
        acc[item.priority] = item._count.priority;
        return acc;
      }, {})
    };
  }

  /**
   * Record analytics event
   */
  async recordQueueAnalytics(eventType, eventData) {
    try {
      await this.prisma.analytics.create({
        data: {
          eventType,
          eventData,
          timestamp: new Date(),
          successful: true
        }
      });
    } catch (error) {
      logger.warn('ANALYTICS', 'Failed to record queue analytics', { eventType, error: error.message });
    }
  }

  async getQueueSize() {
    return await this.prisma.queueEntry.count({
      where: { status: 'WAITING' }
    });
  }
}
