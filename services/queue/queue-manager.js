/**
 * 📋 Queue Manager - Core CRUD Operations
 * Gestisce aggiunta, rimozione e assegnazione dalla coda
 */

import logger from '../../utils/logger.js';

export class QueueManager {
  constructor(prisma, queuesCache) {
    this.prisma = prisma;
    this.queues = queuesCache; // Reference to shared cache
  }

  /**
   * Aggiunge sessione alla coda
   */
  async addToQueue(sessionId, priority = 'MEDIUM', requiredSkills = [], calculateEstimatedWait, getQueuePosition, notifyOperators, recordAnalytics) {
    try {
      // Check if already in queue (prevent duplicates)
      const existing = await this.prisma.queueEntry.findFirst({
        where: {
          sessionId,
          status: { in: ['WAITING', 'ASSIGNED'] }
        }
      });

      if (existing) {
        logger.info('QUEUE', 'Session already in queue', { sessionId, status: existing.status });
        return {
          position: await getQueuePosition(sessionId),
          estimatedWait: existing.estimatedWaitTime,
          queueId: existing.id,
          alreadyInQueue: true
        };
      }

      const queueEntry = await this.prisma.queueEntry.create({
        data: {
          sessionId,
          priority,
          requiredSkills,
          status: 'WAITING',
          enteredAt: new Date(),
          estimatedWaitTime: await calculateEstimatedWait(priority)
        }
      });

      // Aggiorna cache in-memory
      this.queues.set(sessionId, {
        ...queueEntry,
        position: await getQueuePosition(sessionId)
      });

      logger.queue.added(sessionId, priority, { queueId: queueEntry.id });

      // Notifica operatori disponibili
      await notifyOperators(queueEntry);

      // Registra analytics
      await recordAnalytics('queue_entry_added', {
        sessionId,
        priority,
        estimatedWait: queueEntry.estimatedWaitTime,
        queueSize: await this.getQueueSize()
      });

      return {
        position: await getQueuePosition(sessionId),
        estimatedWait: queueEntry.estimatedWaitTime,
        queueId: queueEntry.id
      };

    } catch (error) {
      logger.error('QUEUE', 'Failed to add to queue', error);
      throw error;
    }
  }

  /**
   * Assegna prossimo dalla coda a operatore
   */
  async assignNextInQueue(operatorId, operatorSkills = [], updateQueuePositions, recordAnalytics) {
    try {
      // Trova il prossimo in coda con priorità e skills matching
      const nextEntry = await this.prisma.queueEntry.findFirst({
        where: {
          status: 'WAITING',
          OR: [
            { requiredSkills: { isEmpty: true } },
            { requiredSkills: { hasSome: operatorSkills } }
          ]
        },
        orderBy: [
          { priority: 'desc' }, // HIGH > MEDIUM > LOW
          { enteredAt: 'asc' }   // FIFO
        ]
      });

      if (!nextEntry) {
        return { assigned: false, reason: 'Queue empty' };
      }

      // Assegna a operatore
      await this.prisma.queueEntry.update({
        where: { id: nextEntry.id },
        data: {
          status: 'ASSIGNED',
          assignedTo: operatorId,
          assignedAt: new Date()
        }
      });

      // Crea OperatorChat
      const operatorChat = await this.prisma.operatorChat.create({
        data: {
          sessionId: nextEntry.sessionId,
          operatorId
        }
      });

      // Aggiorna sessione
      await this.prisma.chatSession.update({
        where: { sessionId: nextEntry.sessionId },
        data: { status: 'WITH_OPERATOR' }
      });

      // Rimuovi da cache
      this.queues.delete(nextEntry.sessionId);

      // Ricalcola posizioni per tutti
      await updateQueuePositions();

      logger.queue.assigned(nextEntry.sessionId, operatorId, { chatId: operatorChat.id });

      // Analytics
      const waitTime = new Date() - nextEntry.enteredAt;
      await recordAnalytics('queue_assignment_completed', {
        sessionId: nextEntry.sessionId,
        operatorId,
        waitTime,
        priority: nextEntry.priority
      });

      return {
        assigned: true,
        sessionId: nextEntry.sessionId,
        operatorChatId: operatorChat.id,
        waitTime
      };

    } catch (error) {
      logger.error('QUEUE', 'Failed to assign from queue', error);
      throw error;
    }
  }

  /**
   * Rimuovi dalla coda (timeout, cancel, etc.)
   */
  async removeFromQueue(sessionId, reason = 'USER_CANCELLED', getQueuePosition, updateQueuePositions, recordAnalytics) {
    try {
      const entry = await this.prisma.queueEntry.findFirst({
        where: { sessionId, status: 'WAITING' }
      });

      if (!entry) return false;

      await this.prisma.queueEntry.update({
        where: { id: entry.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason
        }
      });

      this.queues.delete(sessionId);
      await updateQueuePositions();

      logger.info('QUEUE', 'Session removed from queue', { sessionId, reason });

      // Analytics
      const waitTime = new Date() - entry.enteredAt;
      await recordAnalytics('queue_entry_cancelled', {
        sessionId,
        reason,
        waitTime,
        position: await getQueuePosition(sessionId)
      });

      return true;

    } catch (error) {
      logger.error('QUEUE', 'Failed to remove from queue', error);
      return false;
    }
  }

  /**
   * Aggiorna posizioni coda
   */
  async updateQueuePositions(calculateEstimatedWait) {
    const entries = await this.prisma.queueEntry.findMany({
      where: { status: 'WAITING' },
      orderBy: [
        { priority: 'desc' },
        { enteredAt: 'asc' }
      ]
    });

    // Import notification utility
    let notifyWidget;
    try {
      const notifications = await import('../../utils/notifications.js');
      notifyWidget = notifications.notifyWidget;
    } catch (error) {
      logger.warn('QUEUE', 'Failed to import notifications', { error: error.message });
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const newPosition = i + 1;
      const oldPosition = this.queues.has(entry.sessionId) ?
        this.queues.get(entry.sessionId).position : null;

      // Update cache
      if (this.queues.has(entry.sessionId)) {
        this.queues.get(entry.sessionId).position = newPosition;
      }

      // Notify widget if position changed
      if (oldPosition && oldPosition !== newPosition && notifyWidget) {
        const estimatedWait = await calculateEstimatedWait(entry.priority);
        notifyWidget(entry.sessionId, {
          event: 'queue_update',
          position: newPosition,
          oldPosition,
          estimatedWait,
          priority: entry.priority,
          message: newPosition < oldPosition ?
            `🎉 Sei salito in coda! Ora sei al ${newPosition}° posto` :
            `Posizione aggiornata: ${newPosition}° in coda`
        });
      }
    }
  }

  /**
   * Load queue entries from database
   */
  async loadQueuesFromDB(getQueuePosition) {
    const entries = await this.prisma.queueEntry.findMany({
      where: { status: 'WAITING' }
    });

    for (const entry of entries) {
      this.queues.set(entry.sessionId, {
        ...entry,
        position: await getQueuePosition(entry.sessionId)
      });
    }

    logger.info('QUEUE', 'Loaded queue entries from database', { count: entries.length });
  }

  /**
   * Cleanup old/stale queue entries
   */
  async cleanupStaleEntries(updateQueuePositions) {
    try {
      const now = new Date();
      const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);

      // Find old WAITING entries where session is no longer active
      const staleEntries = await this.prisma.queueEntry.findMany({
        where: {
          status: 'WAITING',
          enteredAt: { lt: thirtyMinutesAgo }
        },
        include: {
          session: true
        }
      });

      let cleanedCount = 0;

      for (const entry of staleEntries) {
        // Cancel if session is ENDED, CANCELLED, or RESOLVED
        if (['ENDED', 'CANCELLED', 'RESOLVED', 'NOT_RESOLVED'].includes(entry.session.status)) {
          await this.prisma.queueEntry.update({
            where: { id: entry.id },
            data: {
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancelReason: 'session_ended_cleanup'
            }
          });
          this.queues.delete(entry.sessionId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info('QUEUE', 'Cleaned up stale queue entries', { cleanedCount });
        await updateQueuePositions();
      }

      return cleanedCount;
    } catch (error) {
      logger.error('QUEUE', 'Failed to cleanup stale queue entries', error);
      return 0;
    }
  }

  async getQueueSize() {
    return await this.prisma.queueEntry.count({
      where: { status: 'WAITING' }
    });
  }
}
