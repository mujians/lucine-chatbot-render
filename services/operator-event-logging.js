/**
 * 📝 Operator Event Logging Service
 * Tracks all operator actions for analytics and audit trail
 */

import container from '../config/container.js';

class OperatorEventLogger {
  constructor() {
    this.prisma = null;
  }

  async init(prisma) {
    this.prisma = prisma;
    console.log('✅ Operator Event Logging initialized');
  }

  /**
   * Log operator action to Analytics table
   */
  async logEvent(operatorId, eventType, eventData = {}) {
    try {
      if (!this.prisma) {
        console.warn('⚠️ Prisma not initialized, skipping event log');
        return;
      }

      const operator = operatorId ? await this.prisma.operator.findUnique({
        where: { id: operatorId },
        select: { name: true, username: true }
      }) : null;

      await this.prisma.analytics.create({
        data: {
          eventType,
          eventData: {
            ...eventData,
            operatorId,
            operatorName: operator?.name,
            operatorUsername: operator?.username,
            timestamp: new Date().toISOString()
          },
          successful: true
        }
      });

      // Console logging for real-time monitoring
      const emoji = this.getEmojiForEvent(eventType);
      console.log(`${emoji} [${operator?.name || 'System'}] ${eventType}:`, eventData);
    } catch (error) {
      console.error('❌ Failed to log operator event:', error);
    }
  }

  /**
   * Specific logging methods for common events
   */
  async logChatTaken(operatorId, sessionId, queueWaitTime) {
    await this.logEvent(operatorId, 'operator_took_chat', {
      sessionId,
      queueWaitTime: Math.round(queueWaitTime / 1000), // Convert to seconds
      action: 'chat_assignment'
    });
  }

  async logChatClosed(operatorId, sessionId, duration, rating = null) {
    await this.logEvent(operatorId, 'operator_closed_chat', {
      sessionId,
      duration: Math.round(duration / 1000), // Convert to seconds
      rating,
      action: 'chat_closure'
    });
  }

  async logMessageSent(operatorId, sessionId, messageLength) {
    await this.logEvent(operatorId, 'operator_sent_message', {
      sessionId,
      messageLength,
      action: 'message_sent'
    });
  }

  async logLogin(operatorId, ipAddress, userAgent) {
    await this.logEvent(operatorId, 'operator_login', {
      ipAddress,
      userAgent,
      action: 'authentication'
    });
  }

  async logLogout(operatorId) {
    await this.logEvent(operatorId, 'operator_logout', {
      action: 'authentication'
    });
  }

  async logStatusChange(operatorId, fromStatus, toStatus) {
    await this.logEvent(operatorId, 'operator_status_change', {
      fromStatus,
      toStatus,
      action: 'status_update'
    });
  }

  async logAvailabilityChange(operatorId, fromAvailability, toAvailability) {
    await this.logEvent(operatorId, 'operator_availability_change', {
      fromAvailability,
      toAvailability,
      action: 'availability_update'
    });
  }

  async logSLAWarning(operatorId, sessionId, slaType, timeRemaining) {
    await this.logEvent(operatorId, 'sla_warning', {
      sessionId,
      slaType,
      timeRemaining,
      action: 'sla_alert'
    });
  }

  async logSLAViolation(operatorId, sessionId, slaType, exceededBy) {
    await this.logEvent(operatorId, 'sla_violation', {
      sessionId,
      slaType,
      exceededBy,
      action: 'sla_alert'
    });
  }

  async logTicketCreated(operatorId, ticketId, ticketNumber, priority) {
    await this.logEvent(operatorId, 'operator_created_ticket', {
      ticketId,
      ticketNumber,
      priority,
      action: 'ticket_management'
    });
  }

  async logTicketResolved(operatorId, ticketId, ticketNumber, resolutionTime) {
    await this.logEvent(operatorId, 'operator_resolved_ticket', {
      ticketId,
      ticketNumber,
      resolutionTime: Math.round(resolutionTime / 1000), // Convert to seconds
      action: 'ticket_management'
    });
  }

  /**
   * Get timeline of events for a specific operator
   */
  async getOperatorTimeline(operatorId, limit = 50) {
    try {
      const events = await this.prisma.analytics.findMany({
        where: {
          eventData: {
            path: ['operatorId'],
            equals: operatorId
          }
        },
        orderBy: { timestamp: 'desc' },
        take: limit
      });

      return events.map(event => ({
        type: event.eventType,
        timestamp: event.timestamp,
        data: event.eventData
      }));
    } catch (error) {
      console.error('❌ Failed to get operator timeline:', error);
      return [];
    }
  }

  /**
   * Get operator statistics
   */
  async getOperatorStats(operatorId, days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const events = await this.prisma.analytics.findMany({
        where: {
          eventData: {
            path: ['operatorId'],
            equals: operatorId
          },
          timestamp: { gte: startDate }
        }
      });

      const stats = {
        totalChats: 0,
        totalMessages: 0,
        avgChatDuration: 0,
        totalChatTime: 0,
        slaViolations: 0,
        ticketsCreated: 0,
        ticketsResolved: 0
      };

      let chatDurations = [];

      events.forEach(event => {
        switch (event.eventType) {
          case 'operator_took_chat':
            stats.totalChats++;
            break;
          case 'operator_sent_message':
            stats.totalMessages++;
            break;
          case 'operator_closed_chat':
            if (event.eventData.duration) {
              chatDurations.push(event.eventData.duration);
              stats.totalChatTime += event.eventData.duration;
            }
            break;
          case 'sla_violation':
            stats.slaViolations++;
            break;
          case 'operator_created_ticket':
            stats.ticketsCreated++;
            break;
          case 'operator_resolved_ticket':
            stats.ticketsResolved++;
            break;
        }
      });

      if (chatDurations.length > 0) {
        stats.avgChatDuration = Math.round(
          chatDurations.reduce((a, b) => a + b, 0) / chatDurations.length
        );
      }

      return stats;
    } catch (error) {
      console.error('❌ Failed to get operator stats:', error);
      return null;
    }
  }

  /**
   * Get emoji for event type (for console logging)
   */
  getEmojiForEvent(eventType) {
    const emojiMap = {
      operator_took_chat: '📥',
      operator_closed_chat: '✅',
      operator_sent_message: '💬',
      operator_login: '🔓',
      operator_logout: '🔒',
      operator_status_change: '🔄',
      operator_availability_change: '🎯',
      sla_warning: '⚠️',
      sla_violation: '🚨',
      operator_created_ticket: '🎫',
      operator_resolved_ticket: '✔️'
    };

    return emojiMap[eventType] || '📝';
  }

  /**
   * Cleanup old events (retention policy)
   */
  async cleanupOldEvents(retentionDays = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.prisma.analytics.deleteMany({
        where: {
          eventType: { in: [
            'operator_took_chat',
            'operator_closed_chat',
            'operator_sent_message',
            'operator_login',
            'operator_logout',
            'operator_status_change',
            'operator_availability_change'
          ]},
          timestamp: { lt: cutoffDate }
        }
      });

      console.log(`🧹 Cleaned up ${result.count} old operator events (older than ${retentionDays} days)`);
      return result.count;
    } catch (error) {
      console.error('❌ Failed to cleanup old events:', error);
      return 0;
    }
  }
}

export const operatorEventLogger = new OperatorEventLogger();
