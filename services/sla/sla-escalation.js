/**
 * 📈 SLA Escalation Manager
 * Gestisce escalation automatica e creazione ticket
 */

import logger from '../../utils/logger.js';

export class SLAEscalationManager {
  constructor(prisma) {
    this.prisma = prisma;
    this.escalationRules = this.loadEscalationRules();
  }

  /**
   * Escalation automatica
   */
  async escalateEntity(entityId, entityType, reason, metadata, recordSLAEvent) {
    try {
      if (entityType === 'TICKET') {
        // Upgrade priority del ticket
        const ticket = await this.prisma.ticket.findUnique({
          where: { id: entityId }
        });

        if (ticket) {
          const newPriority = this.upgradePriority(ticket.priority);
          await this.prisma.ticket.update({
            where: { id: entityId },
            data: {
              priority: newPriority,
              status: 'ESCALATED'
            }
          });

          logger.info('SLA', 'Ticket escalated', {
            ticketId: entityId,
            oldPriority: ticket.priority,
            newPriority
          });
        }
      } else if (entityType === 'SESSION') {
        // Crea ticket di escalation per sessione
        await this.createEscalationTicket({ entityId, entityType }, metadata.minutesLate);
      }

      // Record escalation
      await recordSLAEvent('escalation_triggered', null, {
        entityId,
        entityType,
        reason,
        metadata
      });

    } catch (error) {
      logger.error('SLA', 'Escalation failed', error);
    }
  }

  /**
   * Crea ticket di escalation
   */
  async createEscalationTicket(sla, minutesLate) {
    try {
      const ticket = await this.prisma.ticket.create({
        data: {
          sessionId: sla.entityId,
          subject: `🚨 ESCALATION SLA - Sessione ${sla.entityId.substr(-8)}`,
          description: `Escalation automatica per violazione SLA.\n\nSessione: ${sla.entityId}\nTempo scaduto: ${minutesLate} minuti\nPriorità originale: ${sla.priority}\n\nRichiedere intervento management immediato.`,
          priority: 'URGENT',
          status: 'OPEN',
          contactMethod: 'CHAT'
        }
      });

      logger.info('SLA', 'Escalation ticket created', {
        ticketNumber: ticket.ticketNumber,
        sessionId: sla.entityId,
        minutesLate
      });

      return ticket;

    } catch (error) {
      logger.error('SLA', 'Failed to create escalation ticket', error);
    }
  }

  /**
   * Upgrade priority
   */
  upgradePriority(currentPriority) {
    const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    const currentIndex = priorities.indexOf(currentPriority);
    return priorities[Math.min(currentIndex + 1, priorities.length - 1)];
  }

  /**
   * Load escalation rules
   */
  loadEscalationRules() {
    return {
      RESPONSE_VIOLATION: {
        action: 'UPGRADE_PRIORITY',
        notifyManagement: true
      },
      RESOLUTION_VIOLATION: {
        action: 'CREATE_ESCALATION_TICKET',
        notifyManagement: true,
        urgentNotification: true
      }
    };
  }
}
