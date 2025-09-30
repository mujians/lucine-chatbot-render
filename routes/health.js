/**
 * 🏥 Health Monitoring Routes - Lucine di Natale
 * Endpoint per monitoraggio sistema e performance
 */

import express from 'express';
import { healthService } from '../services/health-service.js';
import { authenticateOperator } from '../middleware/security.js';

const router = express.Router();

/**
 * 📊 Health status generale
 */
router.get('/status', async (req, res) => {
    try {
        const healthStatus = healthService.getHealthStatus();
        const latestMetrics = healthService.getLatestMetrics();
        
        res.json({
            ...healthStatus,
            timestamp: new Date(),
            uptime: Math.round(process.uptime()),
            metrics: latestMetrics ? {
                database: latestMetrics.database,
                memory: latestMetrics.memory,
                sessions: latestMetrics.sessions,
                queue: latestMetrics.queue
            } : null
        });
        
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Health check failed',
            error: error.message 
        });
    }
});

/**
 * 📈 Metriche dettagliate (requires auth)
 */
router.get('/metrics', authenticateOperator, async (req, res) => {
    try {
        const minutes = parseInt(req.query.minutes) || 60;
        const metricsHistory = healthService.getMetricsHistory(minutes);
        const latestMetrics = healthService.getLatestMetrics();
        
        res.json({
            latest: latestMetrics,
            history: metricsHistory,
            period: `${minutes} minutes`,
            dataPoints: metricsHistory.length
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});

/**
 * 🚨 Alert attivi
 */
router.get('/alerts', authenticateOperator, async (req, res) => {
    try {
        const healthStatus = healthService.getHealthStatus();
        const allAlerts = Array.from(healthService.alerts.values())
            .sort((a, b) => b.timestamp - a.timestamp);
        
        res.json({
            status: healthStatus.status,
            activeAlerts: healthStatus.alerts || [],
            allAlerts: allAlerts.slice(0, 50), // Ultimi 50
            summary: {
                critical: allAlerts.filter(a => a.severity === 'critical').length,
                warning: allAlerts.filter(a => a.severity === 'warning').length,
                total: allAlerts.length
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

/**
 * 🔧 Configurazione thresholds (admin only)
 */
router.get('/config', authenticateOperator, async (req, res) => {
    try {
        res.json({
            thresholds: healthService.thresholds,
            monitoring: {
                interval: '60 seconds',
                retention: '1 hour (memory), persistent (database)',
                alertRetention: '6 hours'
            }
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch config' });
    }
});

/**
 * 🔧 Aggiorna thresholds (admin only)
 */
router.put('/config', authenticateOperator, async (req, res) => {
    try {
        const { thresholds } = req.body;
        
        // Validazione thresholds
        const validKeys = ['dbResponseTime', 'memoryUsage', 'apiResponseTime', 'errorRate', 'queueWaitTime', 'sessionTimeout'];
        const updates = {};
        
        for (const [key, value] of Object.entries(thresholds || {})) {
            if (validKeys.includes(key) && typeof value === 'number' && value > 0) {
                updates[key] = value;
            }
        }
        
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid threshold updates provided' });
        }
        
        // Aggiorna thresholds
        Object.assign(healthService.thresholds, updates);
        
        res.json({
            success: true,
            message: `Updated ${Object.keys(updates).length} thresholds`,
            updatedThresholds: updates,
            currentThresholds: healthService.thresholds
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to update config' });
    }
});

/**
 * 🔄 Force metrics collection
 */
router.post('/collect', authenticateOperator, async (req, res) => {
    try {
        await healthService.collectSystemMetrics();
        const latestMetrics = healthService.getLatestMetrics();
        
        res.json({
            success: true,
            message: 'Metrics collected successfully',
            metrics: latestMetrics
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to collect metrics' });
    }
});

/**
 * 🧪 Test health checks
 */
router.post('/test', authenticateOperator, async (req, res) => {
    try {
        const start = Date.now();
        
        // Test database connectivity
        const dbTest = await healthService.measureDatabasePerformance();
        
        // Test memory
        const memoryTest = healthService.getMemoryMetrics();
        
        // Test queue
        const queueTest = await healthService.getQueueMetrics();
        
        const duration = Date.now() - start;
        
        res.json({
            success: true,
            duration: `${duration}ms`,
            tests: {
                database: dbTest,
                memory: memoryTest,
                queue: queueTest
            },
            timestamp: new Date()
        });
        
    } catch (error) {
        res.status(500).json({ 
            success: false,
            error: error.message,
            timestamp: new Date()
        });
    }
});

export default router;