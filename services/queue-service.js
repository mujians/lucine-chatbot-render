/**
 * 📊 Queue Management Service - Lucine di Natale
 * Sistema di coda persistente per gestione operatori
 *
 * Architecture: Orchestrates 3 specialized modules
 * - QueueManager: CRUD operations (add, assign, remove)
 * - QueueAnalytics: Stats, metrics, position calculations
 * - QueueSLAMonitor: SLA monitoring and escalation
 */

import logger from '../utils/logger.js';
import { QueueManager } from './queue/queue-manager.js';
import { QueueAnalytics } from './queue/queue-analytics.js';
import { QueueSLAMonitor } from './queue/queue-sla.js';

class QueueService {
  constructor() {
    this.queues = new Map(); // Shared in-memory cache for performance
    this.prisma = null; // Assigned during init

    // Module instances (initialized in init())
    this.manager = null;
    this.analytics = null;
    this.slaMonitor = null;

    this.wsNotifier = null; // WebSocket notifier (set externally)
  }

  async init(prisma) {
    this.prisma = prisma;

    // Initialize modules with shared dependencies
    this.manager = new QueueManager(prisma, this.queues);
    this.analytics = new QueueAnalytics(prisma);
    this.slaMonitor = new QueueSLAMonitor(prisma);

    // Load existing queue entries from database
    await this.manager.loadQueuesFromDB(
      this.getQueuePosition.bind(this)
    );

    // Start SLA monitoring
    this.slaMonitor.startSLAMonitoring();

    logger.info('QUEUE', 'Queue Service initialized', {
      modules: ['QueueManager', 'QueueAnalytics', 'QueueSLAMonitor']
    });
  }

  /**
   * 📋 Aggiunge sessione alla coda
   */
  async addToQueue(sessionId, priority = 'MEDIUM', requiredSkills = []) {
    return await this.manager.addToQueue(
      sessionId,
      priority,
      requiredSkills,
      this.calculateEstimatedWait.bind(this),
      this.getQueuePosition.bind(this),
      this.notifyAvailableOperators.bind(this),
      this.recordQueueAnalytics.bind(this)
    );
  }

  /**
   * 🎯 Assegna prossimo dalla coda a operatore
   */
  async assignNextInQueue(operatorId, operatorSkills = []) {
    return await this.manager.assignNextInQueue(
      operatorId,
      operatorSkills,
      this.updateQueuePositions.bind(this),
      this.recordQueueAnalytics.bind(this)
    );
  }

  /**
   * 🚫 Rimuovi dalla coda
   */
  async removeFromQueue(sessionId, reason = 'USER_CANCELLED') {
    return await this.manager.removeFromQueue(
      sessionId,
      reason,
      this.getQueuePosition.bind(this),
      this.updateQueuePositions.bind(this),
      this.recordQueueAnalytics.bind(this)
    );
  }

  /**
   * 📊 Ottieni posizione in coda
   */
  async getQueuePosition(sessionId) {
    return await this.analytics.getQueuePosition(sessionId);
  }

  /**
   * 📈 Calcola tempo di attesa stimato
   */
  async calculateEstimatedWait(priority) {
    return await this.analytics.calculateEstimatedWait(priority);
  }

  /**
   * 📊 Statistiche coda
   */
  async getQueueStats() {
    return await this.analytics.getQueueStats();
  }

  /**
   * 📏 Ottieni dimensione coda
   */
  async getQueueSize() {
    return await this.analytics.getQueueSize();
  }

  /**
   * 🔄 Aggiorna posizioni coda
   */
  async updateQueuePositions() {
    return await this.manager.updateQueuePositions(
      this.calculateEstimatedWait.bind(this)
    );
  }

  /**
   * 🧹 Cleanup stale entries
   */
  async cleanupStaleEntries() {
    return await this.manager.cleanupStaleEntries(
      this.updateQueuePositions.bind(this)
    );
  }

  /**
   * 📊 Record analytics event
   */
  async recordQueueAnalytics(eventType, eventData) {
    return await this.analytics.recordQueueAnalytics(eventType, eventData);
  }

  /**
   * 🔔 Notifica operatori disponibili
   */
  async notifyAvailableOperators(queueEntry) {
    const operators = await this.prisma.operator.findMany({
      where: {
        isOnline: true,
        isActive: true
        // No availabilityStatus or lastSeen check - operators control via toggle
      }
    });

    for (const operator of operators) {
      // WebSocket notification
      if (this.wsNotifier) {
        this.wsNotifier.notifyOperator(operator.id, {
          type: 'new_queue_entry',
          sessionId: queueEntry.sessionId,
          priority: queueEntry.priority,
          position: await this.getQueuePosition(queueEntry.sessionId)
        });
      }
    }

    logger.info('QUEUE', 'Operators notified of new queue entry', {
      sessionId: queueEntry.sessionId,
      notifiedCount: operators.length
    });
  }

  /**
   * 🔄 Cleanup method for graceful shutdown
   */
  async cleanup() {
    if (this.slaMonitor) {
      this.slaMonitor.stop();
    }
    logger.info('QUEUE', 'Queue Service cleaned up');
  }
}

// Export singleton instance
export const queueService = new QueueService();
