/**
 * 🏥 Health Monitoring Service - Lucine di Natale
 * Monitoraggio performance e salute del sistema
 */

import { prisma } from '../server.js';
import { performance } from 'perf_hooks';

class HealthService {
    constructor() {
        this.metrics = new Map();
        this.alerts = new Map();
        this.monitoringInterval = null;
        
        // Thresholds configurabili
        this.thresholds = {
            dbResponseTime: 1000, // 1 secondo
            memoryUsage: 80, // 80% RAM
            apiResponseTime: 2000, // 2 secondi
            errorRate: 5, // 5% error rate
            queueWaitTime: 15 * 60 * 1000, // 15 minuti
            sessionTimeout: 30 * 60 * 1000 // 30 minuti
        };
        
        this.init();
    }

    async init() {
        // Avvia monitoraggio continuo
        this.startContinuousMonitoring();
        
        // Inizializza metriche di base
        await this.initializeMetrics();
        
        console.log('🏥 Health Service initialized');
    }

    /**
     * 📊 Monitoraggio continuo delle performance
     */
    startContinuousMonitoring() {
        this.monitoringInterval = setInterval(async () => {
            await this.collectSystemMetrics();
            await this.checkHealthThresholds();
            await this.cleanupOldMetrics();
        }, 60000); // Ogni minuto
    }

    /**
     * 🔍 Raccolta metriche di sistema
     */
    async collectSystemMetrics() {
        const timestamp = new Date();
        
        try {
            // Database performance
            const dbMetrics = await this.measureDatabasePerformance();
            
            // Memory usage
            const memoryMetrics = this.getMemoryMetrics();
            
            // Active sessions
            const sessionMetrics = await this.getSessionMetrics();
            
            // Queue status
            const queueMetrics = await this.getQueueMetrics();
            
            // Error rates
            const errorMetrics = await this.getErrorMetrics();
            
            const metrics = {
                timestamp,
                database: dbMetrics,
                memory: memoryMetrics,
                sessions: sessionMetrics,
                queue: queueMetrics,
                errors: errorMetrics
            };
            
            // Salva in memoria
            this.metrics.set(timestamp.getTime(), metrics);
            
            // Salva metriche critiche nel database
            await this.persistCriticalMetrics(metrics);
            
        } catch (error) {
            console.error('❌ Error collecting system metrics:', error);
        }
    }

    /**
     * 🏃‍♂️ Performance database
     */
    async measureDatabasePerformance() {
        const start = performance.now();
        
        try {
            // Test query semplice
            await prisma.chatSession.count();
            const simpleQueryTime = performance.now() - start;
            
            // Test query complessa
            const complexStart = performance.now();
            await prisma.chatSession.findMany({
                take: 10,
                include: { 
                    messages: { take: 5 },
                    tickets: true 
                },
                orderBy: { lastActivity: 'desc' }
            });
            const complexQueryTime = performance.now() - complexStart;
            
            return {
                simpleQueryTime: Math.round(simpleQueryTime),
                complexQueryTime: Math.round(complexQueryTime),
                status: 'healthy'
            };
            
        } catch (error) {
            return {
                simpleQueryTime: -1,
                complexQueryTime: -1,
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * 💾 Metriche memoria
     */
    getMemoryMetrics() {
        const usage = process.memoryUsage();
        const totalMem = process.platform === 'linux' ? 
            require('os').totalmem() : 2 * 1024 * 1024 * 1024; // Fallback 2GB
        
        return {
            heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
            external: Math.round(usage.external / 1024 / 1024), // MB
            rss: Math.round(usage.rss / 1024 / 1024), // MB
            percentageUsed: Math.round((usage.rss / totalMem) * 100)
        };
    }

    /**
     * 👥 Metriche sessioni
     */
    async getSessionMetrics() {
        try {
            const now = new Date();
            const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000);
            
            const [
                totalActive,
                withOperator,
                recentMessages,
                timeoutSessions
            ] = await Promise.all([
                prisma.chatSession.count({
                    where: { status: { in: ['ACTIVE', 'WITH_OPERATOR'] } }
                }),
                prisma.chatSession.count({
                    where: { status: 'WITH_OPERATOR' }
                }),
                prisma.message.count({
                    where: { timestamp: { gte: fifteenMinutesAgo } }
                }),
                prisma.chatSession.count({
                    where: {
                        status: 'ACTIVE',
                        lastActivity: { lt: new Date(now - this.thresholds.sessionTimeout) }
                    }
                })
            ]);
            
            return {
                totalActive,
                withOperator,
                recentMessages,
                timeoutSessions,
                avgMessagesPerMinute: Math.round(recentMessages / 15)
            };
            
        } catch (error) {
            return {
                totalActive: -1,
                withOperator: -1,
                recentMessages: -1,
                timeoutSessions: -1,
                error: error.message
            };
        }
    }

    /**
     * 📋 Metriche coda
     */
    async getQueueMetrics() {
        try {
            const now = new Date();
            
            const [
                totalWaiting,
                longWaiting,
                avgWaitTime
            ] = await Promise.all([
                prisma.queueEntry.count({
                    where: { status: 'WAITING' }
                }),
                prisma.queueEntry.count({
                    where: {
                        status: 'WAITING',
                        enteredAt: { lt: new Date(now - this.thresholds.queueWaitTime) }
                    }
                }),
                prisma.queueEntry.aggregate({
                    where: { status: 'WAITING' },
                    _avg: { estimatedWaitTime: true }
                })
            ]);
            
            return {
                totalWaiting,
                longWaiting,
                avgWaitTime: Math.round(avgWaitTime._avg.estimatedWaitTime || 0)
            };
            
        } catch (error) {
            return {
                totalWaiting: -1,
                longWaiting: -1,
                avgWaitTime: -1,
                error: error.message
            };
        }
    }

    /**
     * ❌ Metriche errori
     */
    async getErrorMetrics() {
        try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            
            const [
                totalEvents,
                errorEvents,
                criticalErrors
            ] = await Promise.all([
                prisma.analytics.count({
                    where: { timestamp: { gte: oneHourAgo } }
                }),
                prisma.analytics.count({
                    where: {
                        timestamp: { gte: oneHourAgo },
                        successful: false
                    }
                }),
                prisma.analytics.count({
                    where: {
                        timestamp: { gte: oneHourAgo },
                        eventType: { contains: 'error' }
                    }
                })
            ]);
            
            const errorRate = totalEvents > 0 ? (errorEvents / totalEvents) * 100 : 0;
            
            return {
                totalEvents,
                errorEvents,
                criticalErrors,
                errorRate: Math.round(errorRate * 100) / 100
            };
            
        } catch (error) {
            return {
                totalEvents: -1,
                errorEvents: -1,
                criticalErrors: -1,
                errorRate: -1,
                error: error.message
            };
        }
    }

    /**
     * 🚨 Controllo soglie e alert
     */
    async checkHealthThresholds() {
        const latestMetrics = this.getLatestMetrics();
        if (!latestMetrics) return;
        
        const alerts = [];
        
        // Database performance
        if (latestMetrics.database.simpleQueryTime > this.thresholds.dbResponseTime) {
            alerts.push({
                type: 'database_slow',
                severity: 'warning',
                message: `Database response time: ${latestMetrics.database.simpleQueryTime}ms`,
                threshold: this.thresholds.dbResponseTime
            });
        }
        
        // Memory usage
        if (latestMetrics.memory.percentageUsed > this.thresholds.memoryUsage) {
            alerts.push({
                type: 'memory_high',
                severity: 'warning',
                message: `Memory usage: ${latestMetrics.memory.percentageUsed}%`,
                threshold: this.thresholds.memoryUsage
            });
        }
        
        // Error rate
        if (latestMetrics.errors.errorRate > this.thresholds.errorRate) {
            alerts.push({
                type: 'error_rate_high',
                severity: 'critical',
                message: `Error rate: ${latestMetrics.errors.errorRate}%`,
                threshold: this.thresholds.errorRate
            });
        }
        
        // Queue wait time
        if (latestMetrics.queue.longWaiting > 0) {
            alerts.push({
                type: 'queue_wait_long',
                severity: 'warning',
                message: `${latestMetrics.queue.longWaiting} sessions waiting too long`,
                threshold: this.thresholds.queueWaitTime / 60000 // in minutes
            });
        }
        
        // Session timeouts
        if (latestMetrics.sessions.timeoutSessions > 5) {
            alerts.push({
                type: 'session_timeouts',
                severity: 'warning',
                message: `${latestMetrics.sessions.timeoutSessions} sessions timed out`,
                threshold: 5
            });
        }
        
        // Processa alerts
        for (const alert of alerts) {
            await this.processAlert(alert);
        }
    }

    /**
     * 🚨 Gestione alert
     */
    async processAlert(alert) {
        const alertKey = `${alert.type}_${Date.now()}`;
        
        // Evita spam di alert simili
        const recentSimilar = Array.from(this.alerts.values())
            .filter(a => a.type === alert.type && 
                    (Date.now() - a.timestamp) < 5 * 60 * 1000); // 5 minuti
        
        if (recentSimilar.length > 0) return;
        
        // Salva alert
        this.alerts.set(alertKey, {
            ...alert,
            timestamp: Date.now(),
            id: alertKey
        });
        
        // Log dell'alert
        console.log(`🚨 Health Alert [${alert.severity.toUpperCase()}] ${alert.type}: ${alert.message}`);
        
        // Persist nel database per analytics
        await prisma.analytics.create({
            data: {
                eventType: 'health_alert',
                eventData: alert,
                successful: false,
                timestamp: new Date()
            }
        }).catch(err => console.error('Failed to persist health alert:', err));
        
        // Notifica se critico
        if (alert.severity === 'critical') {
            await this.notifyCriticalAlert(alert);
        }
    }

    /**
     * 📢 Notifica alert critici
     */
    async notifyCriticalAlert(alert) {
        try {
            // Trova operatori/manager da notificare
            const managers = await prisma.operator.findMany({
                where: { isActive: true },
                select: { id: true, name: true, email: true }
            });
            
            // WebSocket notification se disponibile
            if (global.operatorConnections) {
                for (const manager of managers) {
                    if (global.operatorConnections.has(manager.id)) {
                        const ws = global.operatorConnections.get(manager.id);
                        ws.send(JSON.stringify({
                            type: 'critical_health_alert',
                            alert,
                            timestamp: new Date().toISOString()
                        }));
                    }
                }
            }
            
        } catch (error) {
            console.error('Failed to notify critical alert:', error);
        }
    }

    /**
     * 💾 Persistenza metriche critiche
     */
    async persistCriticalMetrics(metrics) {
        try {
            await prisma.analytics.create({
                data: {
                    eventType: 'health_metrics',
                    eventData: {
                        dbResponseTime: metrics.database.simpleQueryTime,
                        memoryUsage: metrics.memory.percentageUsed,
                        activeSessions: metrics.sessions.totalActive,
                        queueSize: metrics.queue.totalWaiting,
                        errorRate: metrics.errors.errorRate
                    },
                    successful: true,
                    timestamp: metrics.timestamp
                }
            });
        } catch (error) {
            console.error('Failed to persist health metrics:', error);
        }
    }

    /**
     * 🗑️ Cleanup metriche vecchie
     */
    async cleanupOldMetrics() {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        
        // Rimuovi metriche in memoria più vecchie di 1 ora
        for (const [timestamp, metrics] of this.metrics.entries()) {
            if (timestamp < oneHourAgo) {
                this.metrics.delete(timestamp);
            }
        }
        
        // Rimuovi alert più vecchi di 6 ore
        const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
        for (const [id, alert] of this.alerts.entries()) {
            if (alert.timestamp < sixHoursAgo) {
                this.alerts.delete(id);
            }
        }
    }

    /**
     * 📊 API per dashboard
     */
    getLatestMetrics() {
        const timestamps = Array.from(this.metrics.keys()).sort((a, b) => b - a);
        return timestamps.length > 0 ? this.metrics.get(timestamps[0]) : null;
    }

    getHealthStatus() {
        const latest = this.getLatestMetrics();
        if (!latest) return { status: 'unknown', message: 'No metrics available' };
        
        const criticalAlerts = Array.from(this.alerts.values())
            .filter(alert => alert.severity === 'critical' && 
                    (Date.now() - alert.timestamp) < 15 * 60 * 1000); // 15 minuti
        
        if (criticalAlerts.length > 0) {
            return { 
                status: 'critical', 
                message: `${criticalAlerts.length} critical issues`,
                alerts: criticalAlerts
            };
        }
        
        const warningAlerts = Array.from(this.alerts.values())
            .filter(alert => alert.severity === 'warning' && 
                    (Date.now() - alert.timestamp) < 15 * 60 * 1000);
        
        if (warningAlerts.length > 0) {
            return { 
                status: 'warning', 
                message: `${warningAlerts.length} warnings`,
                alerts: warningAlerts
            };
        }
        
        return { 
            status: 'healthy', 
            message: 'All systems operational'
        };
    }

    getMetricsHistory(minutes = 60) {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        const filtered = Array.from(this.metrics.entries())
            .filter(([timestamp]) => timestamp >= cutoff)
            .sort(([a], [b]) => a - b);
        
        return filtered.map(([timestamp, metrics]) => ({
            timestamp: new Date(timestamp),
            ...metrics
        }));
    }

    async initializeMetrics() {
        // Prima raccolta metriche al startup
        await this.collectSystemMetrics();
    }

    // Cleanup per shutdown graceful
    async cleanup() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        console.log('🏥 Health Service cleaned up');
    }
}

// Export singleton instance
export const healthService = new HealthService();