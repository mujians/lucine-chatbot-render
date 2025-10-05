/**
 * 📊 SLA Monitoring Service - Granular tracking
 * Monitora SLA per RESPONSE_TIME, INACTIVITY_TIMEOUT, RESOLUTION_TIME
 */

class SLAMonitoringService {
  constructor() {
    this.prisma = null;
    this.monitorInterval = null;

    // SLA Thresholds (in seconds)
    this.thresholds = {
      RESPONSE_TIME: 5 * 60,        // 5 minuti - prima risposta operatore
      RESPONSE_WARNING: 3 * 60,     // 3 minuti - warning
      INACTIVITY_TIMEOUT: 10 * 60,  // 10 minuti - timeout inattività
      INACTIVITY_WARNING: 7 * 60,   // 7 minuti - warning
      RESOLUTION_TIME: 24 * 60 * 60, // 24 ore - risoluzione totale
      RESOLUTION_WARNING: 20 * 60 * 60 // 20 ore - warning
    };
  }

  async init(prisma) {
    this.prisma = prisma;

    // Start monitoring every 60 seconds
    this.startMonitoring();

    console.log('✅ SLA Monitoring Service initialized');
  }

  startMonitoring() {
    this.monitorInterval = setInterval(async () => {
      try {
        await this.checkResponseTimeSLA();
        await this.checkInactivitySLA();
        await this.checkResolutionTimeSLA();
      } catch (error) {
        console.error('❌ SLA monitoring error:', error);
      }
    }, 60 * 1000); // Every 60 seconds

    console.log('📊 SLA monitoring started (runs every 60s)');
  }

  /**
   * Check RESPONSE_TIME SLA
   * Verifica che operatore risponda entro X minuti dalla presa in carico
   */
  async checkResponseTimeSLA() {
    const now = new Date();

    // Find active operator chats without first operator message
    const activeChats = await this.prisma.operatorChat.findMany({
      where: {
        endedAt: null,
        startedAt: {
          lt: new Date(now - this.thresholds.RESPONSE_WARNING * 1000)
        }
      },
      include: {
        session: {
          include: {
            messages: {
              where: { sender: 'OPERATOR' },
              orderBy: { timestamp: 'asc' },
              take: 1
            }
          }
        },
        operator: {
          select: { id: true, name: true }
        }
      }
    });

    for (const chat of activeChats) {
      const firstOperatorMessage = chat.session.messages[0];
      const responseTime = firstOperatorMessage
        ? (firstOperatorMessage.timestamp - chat.startedAt) / 1000
        : (now - chat.startedAt) / 1000;

      // Check if already tracked
      const existingRecord = await this.prisma.sLAMonitoringRecord.findFirst({
        where: {
          sessionId: chat.sessionId,
          type: 'RESPONSE_TIME'
        }
      });

      if (existingRecord) continue; // Already tracked

      // Determine status
      let status = 'OK';
      let violatedAt = null;

      if (!firstOperatorMessage && responseTime > this.thresholds.RESPONSE_TIME) {
        // VIOLATED - operatore non ha ancora risposto dopo limite
        status = 'VIOLATED';
        violatedAt = now;

        console.log(`🚨 RESPONSE_TIME SLA VIOLATED: session ${chat.sessionId}, operator ${chat.operator.name}, ${Math.round(responseTime / 60)}min without response`);

        // Notify operator/manager
        await this.notifySLAViolation({
          type: 'RESPONSE_TIME',
          sessionId: chat.sessionId,
          operatorId: chat.operatorId,
          operatorName: chat.operator.name,
          actualMinutes: Math.round(responseTime / 60),
          limitMinutes: Math.round(this.thresholds.RESPONSE_TIME / 60)
        });

      } else if (!firstOperatorMessage && responseTime > this.thresholds.RESPONSE_WARNING) {
        // WARNING - si avvicina al limite
        status = 'WARNING';

        console.log(`⚠️ RESPONSE_TIME SLA WARNING: session ${chat.sessionId}, ${Math.round(responseTime / 60)}min/${Math.round(this.thresholds.RESPONSE_TIME / 60)}min`);
      }

      // Create SLA record if WARNING or VIOLATED
      if (status !== 'OK') {
        await this.prisma.sLAMonitoringRecord.create({
          data: {
            sessionId: chat.sessionId,
            type: 'RESPONSE_TIME',
            limitSeconds: this.thresholds.RESPONSE_TIME,
            actualSeconds: Math.round(responseTime),
            status,
            triggeredAt: chat.startedAt,
            violatedAt,
            metadata: {
              operatorId: chat.operatorId,
              operatorName: chat.operator.name
            }
          }
        });
      }
    }
  }

  /**
   * Check INACTIVITY_TIMEOUT SLA
   * Verifica che non ci sia inattività prolungata (nessun messaggio da X minuti)
   */
  async checkInactivitySLA() {
    const now = new Date();

    // Find active sessions (with or without operator)
    const activeSessions = await this.prisma.chatSession.findMany({
      where: {
        status: { in: ['ACTIVE', 'WITH_OPERATOR'] },
        lastActivity: {
          lt: new Date(now - this.thresholds.INACTIVITY_WARNING * 1000)
        }
      },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1
        },
        operatorChats: {
          where: { endedAt: null },
          include: {
            operator: { select: { id: true, name: true } }
          }
        }
      }
    });

    for (const session of activeSessions) {
      const lastMessage = session.messages[0];
      if (!lastMessage) continue;

      const inactivityTime = (now - lastMessage.timestamp) / 1000;

      // Check if already tracked
      const existingRecord = await this.prisma.sLAMonitoringRecord.findFirst({
        where: {
          sessionId: session.sessionId,
          type: 'INACTIVITY_TIMEOUT',
          createdAt: { gte: new Date(now - 15 * 60 * 1000) } // Negli ultimi 15 min
        }
      });

      if (existingRecord) continue; // Already tracked recently

      let status = 'OK';
      let violatedAt = null;

      if (inactivityTime > this.thresholds.INACTIVITY_TIMEOUT) {
        // VIOLATED - inattività oltre limite
        status = 'VIOLATED';
        violatedAt = now;

        console.log(`🚨 INACTIVITY SLA VIOLATED: session ${session.sessionId}, ${Math.round(inactivityTime / 60)}min inactive`);

        // Auto-close chat o notifica
        if (session.status === 'WITH_OPERATOR') {
          // Notifica operatore di timeout
          const operatorChat = session.operatorChats[0];
          if (operatorChat) {
            await this.notifyInactivityTimeout({
              sessionId: session.sessionId,
              operatorId: operatorChat.operatorId,
              operatorName: operatorChat.operator.name,
              inactiveMinutes: Math.round(inactivityTime / 60)
            });
          }
        }

      } else if (inactivityTime > this.thresholds.INACTIVITY_WARNING) {
        // WARNING
        status = 'WARNING';
        console.log(`⚠️ INACTIVITY WARNING: session ${session.sessionId}, ${Math.round(inactivityTime / 60)}min inactive`);
      }

      if (status !== 'OK') {
        await this.prisma.sLAMonitoringRecord.create({
          data: {
            sessionId: session.sessionId,
            type: 'INACTIVITY_TIMEOUT',
            limitSeconds: this.thresholds.INACTIVITY_TIMEOUT,
            actualSeconds: Math.round(inactivityTime),
            status,
            violatedAt,
            metadata: {
              lastMessageSender: lastMessage.sender,
              operatorId: session.operatorChats[0]?.operatorId
            }
          }
        });
      }
    }
  }

  /**
   * Check RESOLUTION_TIME SLA
   * Verifica che ticket venga risolto entro X ore
   */
  async checkResolutionTimeSLA() {
    const now = new Date();

    // Find open tickets
    const openTickets = await this.prisma.ticket.findMany({
      where: {
        status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_USER'] },
        createdAt: {
          lt: new Date(now - this.thresholds.RESOLUTION_WARNING * 1000)
        }
      },
      include: {
        assignedOperator: {
          select: { id: true, name: true }
        }
      }
    });

    for (const ticket of openTickets) {
      const resolutionTime = (now - ticket.createdAt) / 1000;

      // Check if already tracked
      const existingRecord = await this.prisma.sLAMonitoringRecord.findFirst({
        where: {
          sessionId: ticket.sessionId,
          ticketId: ticket.id,
          type: 'RESOLUTION_TIME'
        }
      });

      if (existingRecord) continue;

      let status = 'OK';
      let violatedAt = null;

      if (resolutionTime > this.thresholds.RESOLUTION_TIME) {
        // VIOLATED
        status = 'VIOLATED';
        violatedAt = now;

        console.log(`🚨 RESOLUTION_TIME SLA VIOLATED: ticket #${ticket.ticketNumber}, ${Math.round(resolutionTime / 3600)}h unresolved`);

        await this.notifySLAViolation({
          type: 'RESOLUTION_TIME',
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          sessionId: ticket.sessionId,
          actualHours: Math.round(resolutionTime / 3600),
          limitHours: Math.round(this.thresholds.RESOLUTION_TIME / 3600)
        });

      } else if (resolutionTime > this.thresholds.RESOLUTION_WARNING) {
        // WARNING
        status = 'WARNING';
        console.log(`⚠️ RESOLUTION_TIME WARNING: ticket #${ticket.ticketNumber}, ${Math.round(resolutionTime / 3600)}h/${Math.round(this.thresholds.RESOLUTION_TIME / 3600)}h`);
      }

      if (status !== 'OK') {
        await this.prisma.sLAMonitoringRecord.create({
          data: {
            sessionId: ticket.sessionId,
            ticketId: ticket.id,
            type: 'RESOLUTION_TIME',
            limitSeconds: this.thresholds.RESOLUTION_TIME,
            actualSeconds: Math.round(resolutionTime),
            status,
            violatedAt,
            metadata: {
              ticketNumber: ticket.ticketNumber,
              assignedTo: ticket.assignedTo,
              assignedName: ticket.assignedOperator?.name
            }
          }
        });
      }
    }
  }

  /**
   * Notify SLA violation (dashboard + logging)
   */
  async notifySLAViolation(data) {
    // Log to console
    console.log('🚨 SLA VIOLATION NOTIFICATION:', data);

    // Future: Send dashboard notification via WebSocket
    // Future: Send email/SMS to managers

    // Create analytics event
    try {
      await this.prisma.analytics.create({
        data: {
          eventType: 'sla_violation',
          eventData: data,
          timestamp: new Date(),
          successful: true
        }
      });
    } catch (error) {
      console.error('Failed to record SLA violation analytics:', error);
    }
  }

  /**
   * Notify inactivity timeout
   */
  async notifyInactivityTimeout(data) {
    console.log('⏱️ INACTIVITY TIMEOUT NOTIFICATION:', data);

    // Future: Send notification to operator dashboard
  }

  /**
   * Get SLA statistics
   */
  async getSLAStats() {
    const stats = await this.prisma.sLAMonitoringRecord.groupBy({
      by: ['type', 'status'],
      _count: { id: true }
    });

    return stats.reduce((acc, item) => {
      if (!acc[item.type]) acc[item.type] = {};
      acc[item.type][item.status] = item._count.id;
      return acc;
    }, {});
  }

  async cleanup() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
    console.log('🔄 SLA Monitoring Service cleaned up');
  }
}

export const slaMonitoringService = new SLAMonitoringService();
