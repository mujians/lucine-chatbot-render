/**
 * 📊 SLA Lifecycle Manager
 * Gestisce creazione e tracking dello stato degli SLA
 */

import logger from '../../utils/logger.js';

export class SLALifecycleManager {
  constructor(prisma, thresholds) {
    this.prisma = prisma;
    this.slaThresholds = thresholds;
  }

  /**
   * Crea nuovo SLA per sessione/ticket
   */
  async createSLA(entityId, entityType, priority = 'MEDIUM', category = 'GENERAL', scheduleSLACheck, recordSLAEvent) {
    try {
      const now = new Date();
      const responseDeadline = new Date(now.getTime() + this.slaThresholds.RESPONSE_TIME[priority]);
      const resolutionDeadline = new Date(now.getTime() + this.slaThresholds.RESOLUTION_TIME[priority]);

      const sla = await this.prisma.sLAMonitoringRecord.create({
        data: {
          entityId,
          entityType, // 'SESSION' | 'TICKET'
          priority,
          category,
          status: 'ACTIVE',
          createdAt: now,
          responseDeadline,
          resolutionDeadline,
          warningThreshold: new Date(now.getTime() +
            this.slaThresholds.RESPONSE_TIME[priority] * this.slaThresholds.WARNING_PERCENTAGE)
        }
      });

      logger.info('SLA', 'SLA created', {
        entityType,
        entityId,
        priority,
        responseDeadline,
        resolutionDeadline
      });

      // Schedule check
      await scheduleSLACheck(sla.id);

      return sla;

    } catch (error) {
      logger.error('SLA', 'Failed to create SLA', error);
      throw error;
    }
  }

  /**
   * Marca SLA come completato (first response)
   */
  async markFirstResponse(entityId, entityType, operatorId, handleResponseSLAViolation, recordSLAEvent) {
    try {
      const sla = await this.prisma.sLAMonitoringRecord.findFirst({
        where: {
          entityId,
          entityType,
          status: 'ACTIVE'
        }
      });

      if (!sla) return null;

      const now = new Date();
      const responseTime = now - sla.createdAt;
      const wasOnTime = now <= sla.responseDeadline;

      await this.prisma.sLAMonitoringRecord.update({
        where: { id: sla.id },
        data: {
          firstResponseAt: now,
          firstResponseTime: Math.round(responseTime / 1000), // in seconds
          responseOperatorId: operatorId,
          responseOnTime: wasOnTime
        }
      });

      // Analytics
      await recordSLAEvent('first_response', sla.id, {
        responseTime,
        wasOnTime,
        operatorId,
        priority: sla.priority
      });

      logger.info('SLA', `First response SLA ${wasOnTime ? 'MET' : 'VIOLATED'}`, {
        entityType,
        entityId,
        responseTime: Math.round(responseTime / 1000),
        wasOnTime
      });

      if (!wasOnTime) {
        await handleResponseSLAViolation(sla, operatorId);
      }

      return { wasOnTime, responseTime };

    } catch (error) {
      logger.error('SLA', 'Failed to mark first response', error);
      throw error;
    }
  }

  /**
   * Marca SLA come risolto
   */
  async markResolved(entityId, entityType, operatorId, resolutionType = 'RESOLVED', handleResolutionSLAViolation, recordSLAEvent) {
    try {
      const sla = await this.prisma.sLAMonitoringRecord.findFirst({
        where: {
          entityId,
          entityType,
          status: 'ACTIVE'
        }
      });

      if (!sla) return null;

      const now = new Date();
      const totalTime = now - sla.createdAt;
      const wasOnTime = now <= sla.resolutionDeadline;

      await this.prisma.sLAMonitoringRecord.update({
        where: { id: sla.id },
        data: {
          resolvedAt: now,
          totalResolutionTime: Math.round(totalTime / 1000), // in seconds
          resolutionOperatorId: operatorId,
          resolutionOnTime: wasOnTime,
          resolutionType,
          status: 'COMPLETED'
        }
      });

      // Analytics
      await recordSLAEvent('resolution_completed', sla.id, {
        totalTime,
        wasOnTime,
        operatorId,
        resolutionType,
        priority: sla.priority
      });

      logger.info('SLA', `Resolution SLA ${wasOnTime ? 'MET' : 'VIOLATED'}`, {
        entityType,
        entityId,
        totalTime: Math.round(totalTime / 1000),
        wasOnTime
      });

      if (!wasOnTime) {
        await handleResolutionSLAViolation(sla, operatorId);
      }

      return { wasOnTime, totalTime };

    } catch (error) {
      logger.error('SLA', 'Failed to mark resolved', error);
      throw error;
    }
  }

  /**
   * Load existing SLAs from database
   */
  async loadExistingSLAs() {
    const activeSLAs = await this.prisma.sLAMonitoringRecord.count({
      where: { status: 'ACTIVE' }
    });
    logger.info('SLA', 'Loaded existing SLA records', { activeSLAs });
    return activeSLAs;
  }
}
