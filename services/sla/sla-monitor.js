/**
 * ⏰ SLA Monitor
 * Gestisce monitoring continuo e warning SLA
 */

import logger from '../../utils/logger.js';
import { notifyOperators } from '../../utils/notifications.js';

export class SLAMonitor {
  constructor(prisma, thresholds) {
    this.prisma = prisma;
    this.slaThresholds = thresholds;
    this.monitoringInterval = null;
  }

  /**
   * Avvia monitoring SLA continuo
   */
  startSLAMonitoring() {
    this.monitoringInterval = setInterval(async () => {
      await this.checkAllSLAs();
    }, 60000); // Check ogni minuto

    logger.info('SLA', 'SLA monitoring started');
  }

  /**
   * Check tutti gli SLA attivi
   */
  async checkAllSLAs(handleResponseSLAViolation, handleResolutionSLAViolation) {
    try {
      const now = new Date();

      // Check response deadline violations (not yet responded and past deadline)
      const responseViolations = await this.prisma.sLAMonitoringRecord.findMany({
        where: {
          status: 'ACTIVE',
          responseDeadline: { lte: now },
          firstResponseAt: null,
          violatedAt: null  // Only get ones not already marked as violated
        }
      });

      for (const sla of responseViolations) {
        await handleResponseSLAViolation(sla);
        // Mark as violated
        await this.prisma.sLAMonitoringRecord.update({
          where: { id: sla.id },
          data: {
            violatedAt: now,
            status: 'VIOLATED'
          }
        });
      }

      // Check resolution deadline violations (not yet resolved and past deadline)
      const resolutionViolations = await this.prisma.sLAMonitoringRecord.findMany({
        where: {
          status: 'ACTIVE',
          resolutionDeadline: { lte: now },
          resolvedAt: null,
          violatedAt: null  // Only get ones not already marked as violated
        }
      });

      for (const sla of resolutionViolations) {
        await handleResolutionSLAViolation(sla);
        // Mark as violated
        await this.prisma.sLAMonitoringRecord.update({
          where: { id: sla.id },
          data: {
            violatedAt: now,
            status: 'VIOLATED'
          }
        });
      }

      if (responseViolations.length > 0 || resolutionViolations.length > 0) {
        logger.warn('SLA', 'SLA violations detected', {
          responseViolations: responseViolations.length,
          resolutionViolations: resolutionViolations.length
        });
      }

    } catch (error) {
      logger.error('SLA', 'SLA monitoring error', error);
    }
  }

  /**
   * Invia warning SLA
   */
  async sendSLAWarning(sla) {
    const timeRemaining = sla.responseDeadline - new Date();
    const minutesRemaining = Math.round(timeRemaining / 60000);

    // Notifica operatori disponibili
    const operators = await this.prisma.operator.findMany({
      where: { isOnline: true, isActive: true }
    });

    for (const operator of operators) {
      // WebSocket notification
      notifyOperators({
        type: 'sla_warning',
        entityType: sla.entityType,
        entityId: sla.entityId,
        priority: sla.priority,
        minutesRemaining,
        message: `⚠️ SLA Warning: ${sla.entityType} ${sla.entityId} - ${minutesRemaining} minuti rimanenti`
      }, operator.id);
    }

    logger.warn('SLA', 'SLA warning sent', {
      entityType: sla.entityType,
      entityId: sla.entityId,
      minutesRemaining,
      notifiedOperators: operators.length
    });
  }

  /**
   * Check specifico per SLA singolo
   */
  async checkSpecificSLA(slaId, handleResponseSLAViolation) {
    const sla = await this.prisma.sLAMonitoringRecord.findUnique({
      where: { id: slaId, status: 'ACTIVE' }
    });

    if (sla && new Date() > sla.responseDeadline && !sla.firstResponseAt) {
      await handleResponseSLAViolation(sla);
    }
  }

  /**
   * Schedule SLA check
   */
  scheduleSLACheck(slaId, handleResponseSLAViolation) {
    // Placeholder - in produzione usare job queue
    setTimeout(async () => {
      await this.checkSpecificSLA(slaId, handleResponseSLAViolation);
    }, 60000); // Check dopo 1 minuto
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('SLA', 'SLA monitoring stopped');
    }
  }
}
