/**
 * 📊 Queue Management Service - Lucine di Natale
 * Sistema di coda persistente per gestione operatori
 */

// Import dinamico di this.prisma verrà fatto al momento dell'inizializzazione
import { twilioService } from './twilio-service.js';

class QueueService {
    constructor() {
        this.queues = new Map(); // In-memory cache per performance
        this.queueUpdateInterval = null;
        this.slaWarningThreshold = 15 * 60 * 1000; // 15 minuti
        this.slaViolationThreshold = 30 * 60 * 1000; // 30 minuti
        this.prisma = null; // Verrà assegnato durante l'init
        
        // L'init sarà chiamato manualmente dopo che this.prisma è pronto
    }

    async init(prisma) {
        this.prisma = prisma;
        // Carica code esistenti dal database al startup
        await this.loadQueuesFromDB();
        
        // Avvia monitoraggio SLA
        this.startSLAMonitoring();
        
        console.log('✅ Queue Service initialized');
    }

    /**
     * 📋 Aggiunge sessione alla coda
     */
    async addToQueue(sessionId, priority = 'MEDIUM', requiredSkills = []) {
        try {
            const queueEntry = await this.prisma.queueEntry.create({
                data: {
                    sessionId,
                    priority,
                    requiredSkills,
                    status: 'WAITING',
                    enteredAt: new Date(),
                    estimatedWaitTime: await this.calculateEstimatedWait(priority)
                }
            });

            // Aggiorna cache in-memory
            this.queues.set(sessionId, {
                ...queueEntry,
                position: await this.getQueuePosition(sessionId)
            });

            console.log(`📋 Session ${sessionId} added to queue with priority ${priority}`);
            
            // Notifica operatori disponibili
            await this.notifyAvailableOperators(queueEntry);
            
            // Registra analytics
            await this.recordQueueAnalytics('queue_entry_added', {
                sessionId,
                priority,
                estimatedWait: queueEntry.estimatedWaitTime,
                queueSize: await this.getQueueSize()
            });

            return {
                position: await this.getQueuePosition(sessionId),
                estimatedWait: queueEntry.estimatedWaitTime,
                queueId: queueEntry.id
            };

        } catch (error) {
            console.error('❌ Failed to add to queue:', error);
            throw error;
        }
    }

    /**
     * 🎯 Assegna prossimo dalla coda a operatore
     */
    async assignNextInQueue(operatorId, operatorSkills = []) {
        try {
            // Trova il prossimo in coda con priorità e skills matching
            const nextEntry = await this.prisma.queueEntry.findFirst({
                where: {
                    status: 'WAITING',
                    OR: [
                        { requiredSkills: { isEmpty: true } },
                        { requiredSkills: { hasSome: operatorSkills } }
                    ]
                },
                orderBy: [
                    { priority: 'desc' }, // HIGH > MEDIUM > LOW
                    { enteredAt: 'asc' }   // FIFO
                ]
            });

            if (!nextEntry) {
                return { assigned: false, reason: 'Queue empty' };
            }

            // Assegna a operatore
            await this.prisma.queueEntry.update({
                where: { id: nextEntry.id },
                data: {
                    status: 'ASSIGNED',
                    assignedTo: operatorId,
                    assignedAt: new Date()
                }
            });

            // Crea OperatorChat
            const operatorChat = await this.prisma.operatorChat.create({
                data: {
                    sessionId: nextEntry.sessionId,
                    operatorId
                }
            });

            // Aggiorna sessione
            await this.prisma.chatSession.update({
                where: { sessionId: nextEntry.sessionId },
                data: { status: 'WITH_OPERATOR' }
            });

            // Rimuovi da cache
            this.queues.delete(nextEntry.sessionId);

            // Ricalcola posizioni per tutti
            await this.updateQueuePositions();

            console.log(`✅ Session ${nextEntry.sessionId} assigned to operator ${operatorId}`);

            // Analytics
            const waitTime = new Date() - nextEntry.enteredAt;
            await this.recordQueueAnalytics('queue_assignment_completed', {
                sessionId: nextEntry.sessionId,
                operatorId,
                waitTime,
                priority: nextEntry.priority
            });

            return {
                assigned: true,
                sessionId: nextEntry.sessionId,
                operatorChatId: operatorChat.id,
                waitTime
            };

        } catch (error) {
            console.error('❌ Failed to assign from queue:', error);
            throw error;
        }
    }

    /**
     * 📊 Ottieni posizione in coda per sessione
     */
    async getQueuePosition(sessionId) {
        const entry = await this.prisma.queueEntry.findFirst({
            where: { sessionId, status: 'WAITING' }
        });

        if (!entry) return null;

        // Priority ranking (higher = more urgent)
        const priorityRank = {
            'URGENT': 4,
            'HIGH': 3,
            'MEDIUM': 2,
            'LOW': 1
        };

        const entryRank = priorityRank[entry.priority] || 1;

        // Get all waiting entries
        const allWaiting = await this.prisma.queueEntry.findMany({
            where: { status: 'WAITING' },
            select: {
                priority: true,
                enteredAt: true
            }
        });

        // Count how many are ahead (higher priority OR same priority but earlier)
        const position = allWaiting.filter(item => {
            const itemRank = priorityRank[item.priority] || 1;
            return itemRank > entryRank ||
                   (itemRank === entryRank && item.enteredAt < entry.enteredAt);
        }).length;

        return position + 1;
    }

    /**
     * 📈 Calcola tempo di attesa stimato
     */
    async calculateEstimatedWait(priority) {
        // Count available operators (online AND not in active chat)
        const allOnlineOperators = await this.prisma.operator.findMany({
            where: { isOnline: true, isActive: true },
            select: { id: true }
        });

        if (allOnlineOperators.length === 0) {
            return 30; // 30 minutes if no operators online
        }

        // Check how many are actually available (not in active chat)
        let availableCount = 0;
        for (const op of allOnlineOperators) {
            const activeChats = await this.prisma.operatorChat.count({
                where: {
                    operatorId: op.id,
                    endedAt: null
                }
            });
            if (activeChats === 0) availableCount++;
        }

        // If operators available, wait should be minimal
        if (availableCount > 0) {
            return 1; // 1 minute - almost instant
        }

        // All operators busy - calculate based on queue size and busy operators
        const busyOperators = allOnlineOperators.length;
        const totalWaiting = await this.prisma.queueEntry.count({
            where: { status: 'WAITING' }
        });

        // Average 5 minutes per chat, distributed across busy operators
        const estimatedMinutes = Math.ceil((totalWaiting / busyOperators) * 5);

        return Math.min(30, Math.max(3, estimatedMinutes)); // Between 3-30 minutes
    }

    /**
     * 🔄 Aggiorna posizioni coda
     */
    async updateQueuePositions() {
        const entries = await this.prisma.queueEntry.findMany({
            where: { status: 'WAITING' },
            orderBy: [
                { priority: 'desc' },
                { enteredAt: 'asc' }
            ]
        });

        // Import notification utility
        let notifyWidget;
        try {
            const notifications = await import('../utils/notifications.js');
            notifyWidget = notifications.notifyWidget;
        } catch (error) {
            console.error('⚠️ Failed to import notifications:', error);
        }

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const newPosition = i + 1;
            const oldPosition = this.queues.has(entry.sessionId) ?
                this.queues.get(entry.sessionId).position : null;

            // Update cache
            if (this.queues.has(entry.sessionId)) {
                this.queues.get(entry.sessionId).position = newPosition;
            }

            // 📱 Notify widget if position changed
            if (oldPosition && oldPosition !== newPosition && notifyWidget) {
                const estimatedWait = await this.calculateEstimatedWait(entry.priority);
                notifyWidget(entry.sessionId, {
                    event: 'queue_update',
                    position: newPosition,
                    oldPosition,
                    estimatedWait,
                    priority: entry.priority,
                    message: newPosition < oldPosition ?
                        `🎉 Sei salito in coda! Ora sei al ${newPosition}° posto` :
                        `Posizione aggiornata: ${newPosition}° in coda`
                });
            }
        }
    }

    /**
     * 🚫 Rimuovi dalla coda (timeout, cancel, etc.)
     */
    async removeFromQueue(sessionId, reason = 'USER_CANCELLED') {
        try {
            const entry = await this.prisma.queueEntry.findFirst({
                where: { sessionId, status: 'WAITING' }
            });

            if (!entry) return false;

            await this.prisma.queueEntry.update({
                where: { id: entry.id },
                data: {
                    status: 'CANCELLED',
                    cancelledAt: new Date(),
                    cancelReason: reason
                }
            });

            this.queues.delete(sessionId);
            await this.updateQueuePositions();

            console.log(`🚫 Session ${sessionId} removed from queue: ${reason}`);

            // Analytics
            const waitTime = new Date() - entry.enteredAt;
            await this.recordQueueAnalytics('queue_entry_cancelled', {
                sessionId,
                reason,
                waitTime,
                position: await this.getQueuePosition(sessionId)
            });

            return true;

        } catch (error) {
            console.error('❌ Failed to remove from queue:', error);
            return false;
        }
    }

    /**
     * ⏰ Monitoraggio SLA e escalation automatica
     */
    startSLAMonitoring() {
        this.slaMonitorInterval = setInterval(async () => {
            await this.checkSLAViolations();
        }, 60000); // Check ogni minuto
    }

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

    async notifySLAWarning(queueEntry) {
        const waitTime = Math.round((new Date() - queueEntry.enteredAt) / 60000);
        const remainingTime = Math.round((this.slaViolationThreshold - (new Date() - queueEntry.enteredAt)) / 60000);

        // Notifica operatori disponibili
        const operators = await this.prisma.operator.findMany({
            where: { isOnline: true, isActive: true }
        });

        for (const operator of operators) {
            // Skip phone notifications for now - field not in schema
            // if (operator.phone) {
            //     await twilioService.notifySLAWarning(
            //         operator.phone,
            //         queueEntry.sessionId.substr(-8),
            //         remainingTime
            //     );
            // }
        }

        console.log(`⏰ SLA warning sent for session ${queueEntry.sessionId}`);
    }

    async escalateSLAViolation(queueEntry) {
        const waitTime = Math.round((new Date() - queueEntry.enteredAt) / 60000);

        // Crea ticket automatico per escalation
        const ticket = await this.prisma.ticket.create({
            data: {
                sessionId: queueEntry.sessionId,
                subject: `SLA VIOLATION - Sessione in attesa ${waitTime} minuti`,
                description: `Escalation automatica per violazione SLA.\n\nSessione ${queueEntry.sessionId} in coda da ${waitTime} minuti.\n\nRichiede intervento immediato.`,
                priority: 'URGENT',
                status: 'OPEN',
                contactMethod: 'CHAT'
            }
        });

        // Notifica manager (tutti gli operatori attivi per ora)
        const managers = await this.prisma.operator.findMany({
            where: { isActive: true }
        });

        for (const manager of managers) {
            // Skip phone notifications for now - field not in schema
            // if (manager.phone) {
            //     await twilioService.sendSMS(
            //         manager.phone,
            //         `🚨 SLA VIOLATION\n\nTicket #${ticket.ticketNumber}\nSessione: ${queueEntry.sessionId}\nAttesa: ${waitTime} minuti\n\nAzione richiesta immediatamente!`
            //     );
            // }
        }

        console.log(`🚨 SLA violation escalated for session ${queueEntry.sessionId}`);
    }

    /**
     * 🔔 Notifica operatori disponibili
     */
    async notifyAvailableOperators(queueEntry) {
        const operators = await this.prisma.operator.findMany({
            where: { 
                isOnline: true, 
                isActive: true,
                lastSeen: { gte: new Date(Date.now() - 5 * 60 * 1000) } // Attivi negli ultimi 5 min
            }
        });

        for (const operator of operators) {
            // WebSocket notification immediata
            if (this.wsNotifier) {
                this.wsNotifier.notifyOperator(operator.id, {
                    type: 'new_queue_entry',
                    sessionId: queueEntry.sessionId,
                    priority: queueEntry.priority,
                    position: await this.getQueuePosition(queueEntry.sessionId)
                });
            }
        }
    }

    /**
     * 📊 Statistiche coda
     */
    async getQueueStats() {
        const stats = await this.prisma.queueEntry.aggregate({
            where: { status: 'WAITING' },
            _count: { id: true },
            _avg: { estimatedWaitTime: true }
        });

        const priorityBreakdown = await this.prisma.queueEntry.groupBy({
            by: ['priority'],
            where: { status: 'WAITING' },
            _count: { priority: true }
        });

        const oldestEntry = await this.prisma.queueEntry.findFirst({
            where: { status: 'WAITING' },
            orderBy: { enteredAt: 'asc' }
        });

        return {
            totalWaiting: stats._count.id || 0,
            avgWaitTime: Math.round(stats._avg.estimatedWaitTime || 0),
            longestWait: oldestEntry ? Math.round((new Date() - oldestEntry.enteredAt) / 60000) : 0,
            priorityBreakdown: priorityBreakdown.reduce((acc, item) => {
                acc[item.priority] = item._count.priority;
                return acc;
            }, {})
        };
    }

    async getQueueSize() {
        return await this.prisma.queueEntry.count({
            where: { status: 'WAITING' }
        });
    }

    async loadQueuesFromDB() {
        const entries = await this.prisma.queueEntry.findMany({
            where: { status: 'WAITING' }
        });

        for (const entry of entries) {
            this.queues.set(entry.sessionId, {
                ...entry,
                position: await this.getQueuePosition(entry.sessionId)
            });
        }

        console.log(`📋 Loaded ${entries.length} queue entries from database`);
    }

    async recordQueueAnalytics(eventType, eventData) {
        try {
            await this.prisma.analytics.create({
                data: {
                    eventType,
                    eventData,
                    timestamp: new Date(),
                    successful: true
                }
            });
        } catch (error) {
            console.error('Failed to record queue analytics:', error);
        }
    }

    // Cleanup method per shutdown graceful
    async cleanup() {
        if (this.slaMonitorInterval) {
            clearInterval(this.slaMonitorInterval);
        }
        console.log('🔄 Queue Service cleaned up');
    }
}

// Export singleton instance
export const queueService = new QueueService();