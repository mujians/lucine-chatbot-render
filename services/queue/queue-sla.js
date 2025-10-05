/**
 * ⏰ Queue SLA Monitor - SLA Violations & Escalations
 * Gestisce monitoraggio SLA e escalation automatica
 */

import logger from '../../utils/logger.js';

export class QueueSLAMonitor {
  constructor(prisma) {
    this.prisma = prisma;
    this.slaWarningThreshold = 15 * 60 * 1000; // 15 minuti
    this.slaViolationThreshold = 30 * 60 * 1000; // 30 minuti
    this.slaMonitorInterval = null;
  }

  /**
   * Avvia monitoraggio SLA
   */
  startSLAMonitoring() {
    this.slaMonitorInterval = setInterval(async () => {
      await this.checkSLAViolations();
    }, 60000); // Check ogni minuto

    logger.info('SLA', 'Queue SLA monitoring started');
  }

  /**
   * Check SLA violations
   */
  async checkSLAViolations() {
    const now = new Date();

    // Trova code che si avvicinano al SLA
    const warningEntries = await this.prisma.queueEntry.findMany({
      where: {
        status: 'WAITING',
        enteredAt: {
          lt: new Date(now - this.slaWarningThreshold),
          gte: new Date(now - this.slaViolationThreshold)
        },
        slaWarningNotified: false
      }
    });

    // Notifica warning
    for (const entry of warningEntries) {
      await this.notifySLAWarning(entry);
      await this.prisma.queueEntry.update({
        where: { id: entry.id },
        data: { slaWarningNotified: true }
      });
    }

    // Trova violazioni SLA
    const violationEntries = await this.prisma.queueEntry.findMany({
      where: {
        status: 'WAITING',
        enteredAt: { lt: new Date(now - this.slaViolationThreshold) },
        slaViolationNotified: false
      }
    });

    // Escalation automatica
    for (const entry of violationEntries) {
      await this.escalateSLAViolation(entry);
      await this.prisma.queueEntry.update({
        where: { id: entry.id },
        data: {
          slaViolationNotified: true,
          priority: 'HIGH' // Upgrade priority
        }
      });
    }
  }

  /**
   * Notifica SLA warning
   */
  async notifySLAWarning(queueEntry) {
    const waitTimeMinutes = Math.round((new Date() - queueEntry.enteredAt) / 60000);
    const remainingMinutes = Math.round((this.slaViolationThreshold - (new Date() - queueEntry.enteredAt)) / 60000);

    // Notifica operatori disponibili
    const operators = await this.prisma.operator.findMany({
      where: {
        isOnline: true,
        isActive: true
        // No availabilityStatus check - operators control via toggle
      }
    });

    logger.warn('SLA', 'SLA warning sent', {
      sessionId: queueEntry.sessionId,
      waitTimeMinutes,
      remainingMinutes,
      notifiedOperators: operators.length
    });

    // TODO: Add actual notification mechanism (WebSocket, SMS, etc.)
  }

  /**
   * Escalate SLA violation
   */
  async escalateSLAViolation(queueEntry) {
    const waitTimeMinutes = Math.round((new Date() - queueEntry.enteredAt) / 60000);

    // Crea ticket automatico per escalation
    const ticket = await this.prisma.ticket.create({
      data: {
        sessionId: queueEntry.sessionId,
        subject: `SLA VIOLATION - Sessione in attesa ${waitTimeMinutes} minuti`,
        description: `Escalation automatica per violazione SLA.\n\nSessione ${queueEntry.sessionId} in coda da ${waitTimeMinutes} minuti.\n\nRichiede intervento immediato.`,
        priority: 'URGENT',
        status: 'OPEN',
        contactMethod: 'CHAT'
      }
    });

    // Notifica manager (tutti gli operatori attivi per ora)
    const managers = await this.prisma.operator.findMany({
      where: { isActive: true }
    });

    logger.error('SLA', 'SLA violation escalated', {
      sessionId: queueEntry.sessionId,
      waitTimeMinutes,
      ticketNumber: ticket.ticketNumber,
      notifiedManagers: managers.length
    });

    // TODO: Add actual notification mechanism (WebSocket, SMS, etc.)
  }

  /**
   * Stop SLA monitoring
   */
  stop() {
    if (this.slaMonitorInterval) {
      clearInterval(this.slaMonitorInterval);
      this.slaMonitorInterval = null;
      logger.info('SLA', 'Queue SLA monitoring stopped');
    }
  }
}
