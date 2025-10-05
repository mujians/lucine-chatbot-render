/**
 * 📊 SLA Metrics & Analytics
 * Gestisce metriche e reporting SLA
 */

import logger from '../../utils/logger.js';

export class SLAMetrics {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Ottieni metriche SLA
   */
  async getSLAMetrics(days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const slaRecords = await this.prisma.sLAMonitoringRecord.findMany({
      where: {
        createdAt: { gte: startDate },
        status: 'COMPLETED'
      }
    });

    const metrics = {
      total: slaRecords.length,
      responseMetrics: {
        onTime: slaRecords.filter(s => s.responseOnTime).length,
        violations: slaRecords.filter(s => s.responseOnTime === false).length,
        avgResponseTime: 0
      },
      resolutionMetrics: {
        onTime: slaRecords.filter(s => s.resolutionOnTime).length,
        violations: slaRecords.filter(s => s.resolutionOnTime === false).length,
        avgResolutionTime: 0
      },
      byPriority: {}
    };

    // Calcola medie
    const responseTimes = slaRecords.filter(s => s.firstResponseTime).map(s => s.firstResponseTime);
    const resolutionTimes = slaRecords.filter(s => s.totalResolutionTime).map(s => s.totalResolutionTime);

    metrics.responseMetrics.avgResponseTime = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 60) // in minutes
      : 0;

    metrics.resolutionMetrics.avgResolutionTime = resolutionTimes.length > 0
      ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length / 3600) // in hours
      : 0;

    // Breakdown per priorità
    ['HIGH', 'MEDIUM', 'LOW'].forEach(priority => {
      const priorityRecords = slaRecords.filter(s => s.priority === priority);
      metrics.byPriority[priority] = {
        total: priorityRecords.length,
        responseOnTime: priorityRecords.filter(s => s.responseOnTime).length,
        resolutionOnTime: priorityRecords.filter(s => s.resolutionOnTime).length
      };
    });

    logger.info('SLA', 'Metrics calculated', {
      days,
      total: metrics.total,
      responseViolations: metrics.responseMetrics.violations,
      resolutionViolations: metrics.resolutionMetrics.violations
    });

    return metrics;
  }

  /**
   * Record SLA event
   */
  async recordSLAEvent(eventType, slaId, eventData) {
    try {
      await this.prisma.analytics.create({
        data: {
          eventType: `sla_${eventType}`,
          eventData: {
            slaId,
            ...eventData
          },
          successful: !eventType.includes('violation')
        }
      });
    } catch (error) {
      logger.warn('SLA', 'Failed to record SLA event', { eventType, error: error.message });
    }
  }
}
