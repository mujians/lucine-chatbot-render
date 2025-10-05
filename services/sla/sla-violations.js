/**
 * 🚨 SLA Violations Handler
 * Gestisce violazioni SLA e escalation
 */

import logger from '../../utils/logger.js';
import { notifyOperators } from '../../utils/notifications.js';
import { twilioService } from '../twilio-service.js';

export class SLAViolationsHandler {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Gestisce violazione SLA response time
   */
  async handleResponseSLAViolation(sla, operatorId = null, escalateEntity, notifyManagement, recordSLAEvent) {
    const violationTime = new Date() - sla.responseDeadline;
    const minutesLate = Math.round(violationTime / 60000);

    // Escalation automatica
    await escalateEntity(sla.entityId, sla.entityType, 'RESPONSE_SLA_VIOLATION', {
      originalPriority: sla.priority,
      minutesLate,
      operatorId
    });

    // Notifica management
    await notifyManagement('RESPONSE_SLA_VIOLATION', sla, minutesLate);

    // Log violazione
    await recordSLAEvent('response_violation', sla.id, {
      violationTime,
      minutesLate,
      originalPriority: sla.priority
    });

    logger.error('SLA', 'Response SLA violation', {
      entityType: sla.entityType,
      entityId: sla.entityId,
      minutesLate
    });
  }

  /**
   * Gestisce violazione SLA resolution time
   */
  async handleResolutionSLAViolation(sla, operatorId = null, escalateEntity, notifyManagement, createEscalationTicket) {
    const violationTime = new Date() - sla.resolutionDeadline;
    const minutesLate = Math.round(violationTime / 60000);

    // Escalation critica
    await escalateEntity(sla.entityId, sla.entityType, 'RESOLUTION_SLA_VIOLATION', {
      originalPriority: sla.priority,
      minutesLate,
      operatorId
    });

    // Notifica urgente management
    await notifyManagement('RESOLUTION_SLA_VIOLATION', sla, minutesLate);

    // Crea ticket di escalation se non esiste
    if (sla.entityType === 'SESSION') {
      await createEscalationTicket(sla, minutesLate);
    }

    logger.error('SLA', 'Resolution SLA violation', {
      entityType: sla.entityType,
      entityId: sla.entityId,
      minutesLate,
      severity: 'CRITICAL'
    });
  }

  /**
   * Notifica management per violazioni
   */
  async notifyManagement(violationType, sla, minutesLate) {
    // Trova manager/supervisori
    const managers = await this.prisma.operator.findMany({
      where: {
        role: { in: ['MANAGER', 'SUPERVISOR'] },
        isActive: true
      }
    });

    const urgencyLevel = violationType === 'RESOLUTION_SLA_VIOLATION' ? '🔥 CRITICO' : '🚨 URGENTE';

    for (const manager of managers) {
      // WebSocket notification immediata
      notifyOperators({
        type: 'management_alert',
        violationType,
        sla,
        minutesLate,
        urgencyLevel,
        message: `${urgencyLevel}: Violazione SLA ${sla.entityType} ${sla.entityId} - ${minutesLate} min in ritardo`
      }, manager.id);

      // SMS/chiamata per violazioni critiche
      if (manager.phone && violationType === 'RESOLUTION_SLA_VIOLATION') {
        await twilioService.sendSMS(
          manager.phone,
          `🔥 VIOLAZIONE SLA CRITICA\n\n${sla.entityType}: ${sla.entityId}\nRitardo: ${minutesLate} minuti\nPriorità: ${sla.priority}\n\nIntervento immediato richiesto!\n\nDashboard: https://lucine-chatbot.onrender.com/dashboard`
        );
      }
    }

    logger.warn('SLA', 'Management notified of violation', {
      violationType,
      notifiedManagers: managers.length,
      urgencyLevel
    });
  }
}
