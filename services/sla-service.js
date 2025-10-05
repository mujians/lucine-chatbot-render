/**
 * ⏰ SLA Monitoring Service - Lucine di Natale
 * Gestisce Service Level Agreements e escalation automatica
 */

// Import dinamico di this.prisma verrà fatto al momento dell'inizializzazione
import { twilioService } from './twilio-service.js';
import { notifyOperators } from '../utils/notifications.js';

class SLAService {
    constructor() {
        this.slaThresholds = {
            RESPONSE_TIME: {
                HIGH: 5 * 60 * 1000,     // 5 minuti per HIGH priority
                MEDIUM: 15 * 60 * 1000,  // 15 minuti per MEDIUM priority
                LOW: 30 * 60 * 1000      // 30 minuti per LOW priority
            },
            RESOLUTION_TIME: {
                HIGH: 2 * 60 * 60 * 1000,  // 2 ore per HIGH priority
                MEDIUM: 8 * 60 * 60 * 1000, // 8 ore per MEDIUM priority
                LOW: 24 * 60 * 60 * 1000   // 24 ore per LOW priority
            },
            WARNING_PERCENTAGE: 0.8 // Avvisa all'80% del tempo SLA
        };

        this.monitoringInterval = null;
        this.escalationRules = this.loadEscalationRules();
        this.prisma = null; // Verrà assegnato durante l'init
        
        // L'init sarà chiamato manualmente dopo che this.prisma è pronto
    }

    async init(prisma) {
        this.prisma = prisma;
        // Avvia monitoring SLA
        this.startSLAMonitoring();
        
        // Carica SLA esistenti dal database
        await this.loadExistingSLAs();
        
        console.log('✅ SLA Service initialized');
    }

    /**
     * 📊 Crea nuovo SLA per sessione/ticket
     */
    async createSLA(entityId, entityType, priority = 'MEDIUM', category = 'GENERAL') {
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

            console.log(`⏰ SLA created for ${entityType} ${entityId} with priority ${priority}`);
            
            // Schedula check SLA
            this.scheduleSLACheck(sla.id);
            
            return sla;

        } catch (error) {
            console.error('❌ Failed to create SLA:', error);
            throw error;
        }
    }

    /**
     * ✅ Marca SLA come completato (first response)
     */
    async markFirstResponse(entityId, entityType, operatorId) {
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
            await this.recordSLAEvent('first_response', sla.id, {
                responseTime,
                wasOnTime,
                operatorId,
                priority: sla.priority
            });

            console.log(`⚡ First response SLA ${wasOnTime ? 'MET' : 'VIOLATED'} for ${entityType} ${entityId}`);

            if (!wasOnTime) {
                await this.handleResponseSLAViolation(sla, operatorId);
            }

            return { wasOnTime, responseTime };

        } catch (error) {
            console.error('❌ Failed to mark first response:', error);
            throw error;
        }
    }

    /**
     * 🏁 Marca SLA come risolto
     */
    async markResolved(entityId, entityType, operatorId, resolutionType = 'RESOLVED') {
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
            await this.recordSLAEvent('resolution_completed', sla.id, {
                totalTime,
                wasOnTime,
                operatorId,
                resolutionType,
                priority: sla.priority
            });

            console.log(`🏁 Resolution SLA ${wasOnTime ? 'MET' : 'VIOLATED'} for ${entityType} ${entityId}`);

            if (!wasOnTime) {
                await this.handleResolutionSLAViolation(sla, operatorId);
            }

            return { wasOnTime, totalTime };

        } catch (error) {
            console.error('❌ Failed to mark resolved:', error);
            throw error;
        }
    }

    /**
     * ⏰ Avvia monitoring SLA continuo
     */
    startSLAMonitoring() {
        this.monitoringInterval = setInterval(async () => {
            await this.checkAllSLAs();
        }, 60000); // Check ogni minuto

        console.log('⏰ SLA monitoring started');
    }

    async checkAllSLAs() {
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
                await this.handleResponseSLAViolation(sla);
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
                await this.handleResolutionSLAViolation(sla);
                // Mark as violated
                await this.prisma.sLAMonitoringRecord.update({
                    where: { id: sla.id },
                    data: {
                        violatedAt: now,
                        status: 'VIOLATED'
                    }
                });
            }

        } catch (error) {
            console.error('❌ SLA monitoring error:', error);
        }
    }

    /**
     * ⚠️ Invia warning SLA
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

            // SMS/WhatsApp se configurato (field not in schema)
            // if (operator.phone && sla.priority === 'HIGH') {
            //     await twilioService.notifySLAWarning(
            //         operator.phone,
            //         sla.entityId.substr(-8),
            //         minutesRemaining
            //     );
            // }
        }

        console.log(`⚠️ SLA warning sent for ${sla.entityType} ${sla.entityId}`);
    }

    /**
     * 🚨 Gestisce violazione SLA response time
     */
    async handleResponseSLAViolation(sla, operatorId = null) {
        const violationTime = new Date() - sla.responseDeadline;
        const minutesLate = Math.round(violationTime / 60000);

        // Escalation automatica
        await this.escalateEntity(sla.entityId, sla.entityType, 'RESPONSE_SLA_VIOLATION', {
            originalPriority: sla.priority,
            minutesLate,
            operatorId
        });

        // Notifica management
        await this.notifyManagement('RESPONSE_SLA_VIOLATION', sla, minutesLate);

        // Log violazione
        await this.recordSLAEvent('response_violation', sla.id, {
            violationTime,
            minutesLate,
            originalPriority: sla.priority
        });

        console.log(`🚨 Response SLA violation: ${sla.entityType} ${sla.entityId} - ${minutesLate} minutes late`);
    }

    /**
     * 🔥 Gestisce violazione SLA resolution time
     */
    async handleResolutionSLAViolation(sla, operatorId = null) {
        const violationTime = new Date() - sla.resolutionDeadline;
        const minutesLate = Math.round(violationTime / 60000);

        // Escalation critica
        await this.escalateEntity(sla.entityId, sla.entityType, 'RESOLUTION_SLA_VIOLATION', {
            originalPriority: sla.priority,
            minutesLate,
            operatorId
        });

        // Notifica urgente management
        await this.notifyManagement('RESOLUTION_SLA_VIOLATION', sla, minutesLate);

        // Crea ticket di escalation se non esiste
        if (sla.entityType === 'SESSION') {
            await this.createEscalationTicket(sla, minutesLate);
        }

        console.log(`🔥 Resolution SLA violation: ${sla.entityType} ${sla.entityId} - ${minutesLate} minutes late`);
    }

    /**
     * 📈 Escalation automatica
     */
    async escalateEntity(entityId, entityType, reason, metadata) {
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

                    console.log(`📈 Ticket ${entityId} escalated to ${newPriority}`);
                }
            } else if (entityType === 'SESSION') {
                // Crea ticket di escalation per sessione
                await this.createEscalationTicket({ entityId, entityType }, metadata.minutesLate);
            }

            // Record escalation
            await this.recordSLAEvent('escalation_triggered', null, {
                entityId,
                entityType,
                reason,
                metadata
            });

        } catch (error) {
            console.error('❌ Escalation failed:', error);
        }
    }

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

            console.log(`🎫 Escalation ticket created: ${ticket.ticketNumber}`);
            return ticket;

        } catch (error) {
            console.error('❌ Failed to create escalation ticket:', error);
        }
    }

    /**
     * 📞 Notifica management per violazioni
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
    }

    /**
     * 📊 Ottieni metriche SLA
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

        return metrics;
    }

    upgradePriority(currentPriority) {
        const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
        const currentIndex = priorities.indexOf(currentPriority);
        return priorities[Math.min(currentIndex + 1, priorities.length - 1)];
    }

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

    async loadExistingSLAs() {
        const activeSLAs = await this.prisma.sLAMonitoringRecord.count({
            where: { status: 'ACTIVE' }
        });
        console.log(`📋 Found ${activeSLAs} active SLA records`);
    }

    scheduleSLACheck(slaId) {
        // Implementazione placeholder - in produzione usare job queue
        setTimeout(async () => {
            await this.checkSpecificSLA(slaId);
        }, 60000); // Check dopo 1 minuto
    }

    async checkSpecificSLA(slaId) {
        // Check specifico per SLA singolo
        const sla = await this.prisma.sLAMonitoringRecord.findUnique({
            where: { id: slaId, status: 'ACTIVE' }
        });

        if (sla && new Date() > sla.responseDeadline && !sla.firstResponseAt) {
            await this.handleResponseSLAViolation(sla);
        }
    }

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
            console.error('Failed to record SLA event:', error);
        }
    }

    // Cleanup method
    async cleanup() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        console.log('🔄 SLA Service cleaned up');
    }
}

// Export singleton instance
export const slaService = new SLAService();