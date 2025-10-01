import container from '../config/container.js';

/**
 * 🕒 SERVIZIO TIMEOUT CHAT - 10 minuti inattività cliente
 * Secondo le specifiche utente
 */

class TimeoutService {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.TIMEOUT_MINUTES = 10; // 10 minuti come richiesto
    this.CHECK_INTERVAL = 2 * 60 * 1000; // Controlla ogni 2 minuti
  }

  start() {
    if (this.isRunning) {
      console.log('⚠️ Timeout service already running');
      return;
    }

    console.log(`🕒 Starting timeout service - ${this.TIMEOUT_MINUTES}min inactivity threshold`);
    this.isRunning = true;
    
    this.intervalId = setInterval(() => {
      this.checkInactiveChats();
    }, this.CHECK_INTERVAL);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 Timeout service stopped');
  }

  async checkInactiveChats() {
    const prisma = container.get('prisma');
    try {
      console.log('🔍 Checking for inactive chats...');

      const timeoutThreshold = new Date(Date.now() - this.TIMEOUT_MINUTES * 60 * 1000);

      // Trova sessioni attive con operatore ma inattive da più di 10 minuti
      const inactiveSessions = await prisma.chatSession.findMany({
        where: {
          status: {
            in: ['ACTIVE', 'WITH_OPERATOR']
          },
          lastActivity: {
            lt: timeoutThreshold
          },
          operatorChats: {
            some: {
              endedAt: null
            }
          }
        },
        include: {
          operatorChats: {
            where: { endedAt: null },
            include: {
              operator: {
                select: { id: true, name: true }
              }
            }
          },
          messages: {
            where: {
              sender: 'USER',
              timestamp: {
                gte: timeoutThreshold
              }
            }
          }
        }
      });

      console.log(`📊 Found ${inactiveSessions.length} potentially inactive sessions`);

      for (const session of inactiveSessions) {
        // Se non ci sono messaggi utente recenti, metti in timeout
        if (session.messages.length === 0) {
          await this.setSessionTimeout(session);
        }
      }

      // Controlla anche sessioni ACTIVE senza operatore (utente ha abbandonato)
      const abandonedSessions = await prisma.chatSession.findMany({
        where: {
          status: 'ACTIVE',
          lastActivity: {
            lt: new Date(Date.now() - 30 * 60 * 1000) // 30 minuti per abbandono
          },
          operatorChats: {
            none: {}
          }
        }
      });

      console.log(`📊 Found ${abandonedSessions.length} abandoned sessions`);

      for (const session of abandonedSessions) {
        await this.setSessionAbandoned(session);
      }

    } catch (error) {
      console.error('❌ Timeout service error:', error);
    }
  }

  async setSessionTimeout(session) {
    try {
      console.log(`⏰ Setting session ${session.sessionId} to WAITING_CLIENT (timeout)`);
      
      // Aggiorna stato sessione
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { 
          status: 'WAITING_CLIENT',
          lastActivity: new Date()
        }
      });

      // Aggiungi messaggio di sistema
      await prisma.message.create({
        data: {
          sessionId: session.sessionId,
          sender: 'SYSTEM',
          message: `⏰ Chat messa in attesa per inattività (${this.TIMEOUT_MINUTES} minuti). Scrivi un messaggio per riattivare la conversazione.`,
          metadata: {
            timeoutReason: 'user_inactivity',
            timeoutMinutes: this.TIMEOUT_MINUTES
          }
        }
      });

      // Log analytics
      await prisma.analytics.create({
        data: {
          eventType: 'chat_timeout',
          sessionId: session.sessionId,
          eventData: {
            reason: 'user_inactivity',
            timeoutMinutes: this.TIMEOUT_MINUTES,
            lastActivity: session.lastActivity,
            operatorCount: session.operatorChats.length
          }
        }
      });

      // Opzionale: Notifica operatore
      if (session.operatorChats.length > 0) {
        const operator = session.operatorChats[0].operator;
        console.log(`📢 Notifying operator ${operator.name} about timeout`);
        
        // Qui potresti aggiungere notifiche WebSocket o email
        // this.notifyOperator(operator.id, 'chat_timeout', session.sessionId);
      }

    } catch (error) {
      console.error(`❌ Error setting timeout for session ${session.sessionId}:`, error);
    }
  }

  async setSessionAbandoned(session) {
    try {
      console.log(`🚫 Setting session ${session.sessionId} to ENDED (abandoned)`);
      
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { 
          status: 'ENDED',
          lastActivity: new Date()
        }
      });

      // Log analytics
      await prisma.analytics.create({
        data: {
          eventType: 'chat_abandoned',
          sessionId: session.sessionId,
          eventData: {
            reason: 'user_abandoned',
            lastActivity: session.lastActivity,
            durationMinutes: Math.round((Date.now() - session.startedAt.getTime()) / (1000 * 60))
          }
        }
      });

    } catch (error) {
      console.error(`❌ Error setting abandoned for session ${session.sessionId}:`, error);
    }
  }

  // Metodo per riattivare chat in timeout quando utente scrive
  async reactivateChat(sessionId) {
    const prisma = container.get('prisma');
    try {
      const session = await prisma.chatSession.findUnique({
        where: { sessionId },
        include: {
          operatorChats: {
            where: { endedAt: null }
          }
        }
      });

      if (session && session.status === 'WAITING_CLIENT') {
        console.log(`🔄 Reactivating chat ${sessionId} from WAITING_CLIENT`);
        
        await prisma.chatSession.update({
          where: { sessionId },
          data: { 
            status: session.operatorChats.length > 0 ? 'WITH_OPERATOR' : 'ACTIVE',
            lastActivity: new Date()
          }
        });

        // Messaggio di riattivazione
        await prisma.message.create({
          data: {
            sessionId,
            sender: 'SYSTEM',
            message: '🔄 Chat riattivata! Continua la conversazione.',
            metadata: {
              reactivationReason: 'user_message'
            }
          }
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error(`❌ Error reactivating chat ${sessionId}:`, error);
      return false;
    }
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      timeoutMinutes: this.TIMEOUT_MINUTES,
      checkIntervalMs: this.CHECK_INTERVAL,
      startTime: this.startTime || null
    };
  }
}

// Singleton instance
export const timeoutService = new TimeoutService();

// Auto-start in production
if (process.env.NODE_ENV === 'production') {
  timeoutService.start();
}

export default timeoutService;