/**
 * 📊 Performance Monitoring & Debugging - Lucine di Natale
 * Comprehensive monitoring and debugging system
 */

import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';

/**
 * 📈 Performance Metrics Collector
 */
export class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.alerts = [];
        this.thresholds = {
            responseTime: 1000, // 1 second
            memoryUsage: 512 * 1024 * 1024, // 512MB
            activeConnections: 100,
            errorRate: 0.05 // 5%
        };
    }
    
    /**
     * 📊 Collect system metrics
     */
    collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        return {
            timestamp: new Date().toISOString(),
            memory: {
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external,
                rss: memUsage.rss
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            uptime: process.uptime(),
            pid: process.pid
        };
    }
    
    /**
     * 🚨 Check performance thresholds
     */
    checkThresholds(metrics) {
        const alerts = [];
        
        if (metrics.memory.heapUsed > this.thresholds.memoryUsage) {
            alerts.push({
                type: 'HIGH_MEMORY_USAGE',
                severity: 'WARNING',
                message: `Memory usage: ${Math.round(metrics.memory.heapUsed / 1024 / 1024)}MB`,
                threshold: Math.round(this.thresholds.memoryUsage / 1024 / 1024),
                timestamp: new Date().toISOString()
            });
        }
        
        return alerts;
    }
    
    /**
     * 📝 Log performance data
     */
    async logPerformanceData(data) {
        try {
            const logDir = path.join(process.cwd(), 'logs');
            await fs.mkdir(logDir, { recursive: true });
            
            const logFile = path.join(logDir, `performance-${new Date().toISOString().split('T')[0]}.json`);
            const logEntry = JSON.stringify(data) + '\n';
            
            await fs.appendFile(logFile, logEntry);
        } catch (error) {
            console.error('❌ Failed to log performance data:', error);
        }
    }
}

// Global performance monitor instance
const perfMonitor = new PerformanceMonitor();

/**
 * ⏱️ Response Time Monitoring Middleware
 */
export const responseTimeMonitor = (req, res, next) => {
    const startTime = performance.now();
    const startTimestamp = Date.now();
    
    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function(...args) {
        const endTime = performance.now();
        const responseTime = endTime - startTime;
        
        // Store metrics
        const route = req.route ? req.route.path : req.path;
        const key = `${req.method}:${route}`;
        
        if (!perfMonitor.metrics.has(key)) {
            perfMonitor.metrics.set(key, {
                calls: 0,
                totalTime: 0,
                avgTime: 0,
                maxTime: 0,
                minTime: Infinity,
                errors: 0
            });
        }
        
        const metrics = perfMonitor.metrics.get(key);
        metrics.calls++;
        metrics.totalTime += responseTime;
        metrics.avgTime = metrics.totalTime / metrics.calls;
        metrics.maxTime = Math.max(metrics.maxTime, responseTime);
        metrics.minTime = Math.min(metrics.minTime, responseTime);
        
        if (res.statusCode >= 400) {
            metrics.errors++;
        }
        
        // Log slow requests
        if (responseTime > perfMonitor.thresholds.responseTime) {
            console.warn('🐌 Slow request detected:', {
                method: req.method,
                url: req.originalUrl,
                responseTime: Math.round(responseTime),
                status: res.statusCode,
                userAgent: req.get('User-Agent'),
                ip: req.ip
            });
        }
        
        // Add response time header
        res.setHeader('X-Response-Time', `${Math.round(responseTime)}ms`);
        
        originalEnd.apply(this, args);
    };
    
    next();
};

/**
 * 🗃️ Database Query Monitoring
 */
export const dbQueryMonitor = (prisma) => {
    if (!prisma) {
        console.warn('⚠️  Prisma not provided to dbQueryMonitor');
        return;
    }
    
    const originalQuery = prisma.$queryRaw;
    const queryMetrics = new Map();
    
    prisma.$queryRaw = async function(query, ...args) {
        const startTime = performance.now();
        
        try {
            const result = await originalQuery.call(this, query, ...args);
            const queryTime = performance.now() - startTime;
            
            // Extract query type
            const queryStr = typeof query === 'string' ? query : query.strings?.join('') || 'unknown';
            const queryType = queryStr.trim().split(' ')[0].toUpperCase();
            
            // Store metrics
            if (!queryMetrics.has(queryType)) {
                queryMetrics.set(queryType, {
                    count: 0,
                    totalTime: 0,
                    avgTime: 0,
                    maxTime: 0,
                    errors: 0
                });
            }
            
            const metrics = queryMetrics.get(queryType);
            metrics.count++;
            metrics.totalTime += queryTime;
            metrics.avgTime = metrics.totalTime / metrics.count;
            metrics.maxTime = Math.max(metrics.maxTime, queryTime);
            
            // Log slow queries
            if (queryTime > 100) { // 100ms threshold
                console.warn('🐌 Slow database query:', {
                    type: queryType,
                    time: Math.round(queryTime),
                    query: queryStr.substring(0, 100) + '...'
                });
            }
            
            return result;
        } catch (error) {
            const queryType = 'ERROR';
            if (!queryMetrics.has(queryType)) {
                queryMetrics.set(queryType, { count: 0, errors: 0 });
            }
            queryMetrics.get(queryType).errors++;
            throw error;
        }
    };
    
    // Expose metrics getter
    prisma.getQueryMetrics = () => Object.fromEntries(queryMetrics);
};

/**
 * 🔍 Error Tracking Middleware
 */
export const errorTracker = (err, req, res, next) => {
    const errorData = {
        timestamp: new Date().toISOString(),
        error: {
            name: err.name,
            message: err.message,
            stack: err.stack
        },
        request: {
            method: req.method,
            url: req.originalUrl,
            headers: req.headers,
            body: req.body,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        },
        response: {
            status: res.statusCode
        }
    };
    
    // Log error
    console.error('❌ Application Error:', errorData);
    
    // Store error in database for analysis
    storeErrorData(errorData).catch(dbErr => {
        console.error('❌ Failed to store error data:', dbErr);
    });
    
    // Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production') {
        res.status(500).json({
            error: 'Si è verificato un errore interno',
            timestamp: errorData.timestamp,
            errorId: generateErrorId(errorData)
        });
    } else {
        res.status(500).json({
            error: err.message,
            stack: err.stack,
            timestamp: errorData.timestamp
        });
    }
};

/**
 * 💾 Store error data in database
 */
async function storeErrorData(errorData, prisma = null) {
    try {
        if (prisma) {
            await prisma.analytics.create({
                data: {
                    eventType: 'application_error',
                    eventData: errorData,
                    timestamp: new Date()
                }
            });
        } else {
            // Fallback to file logging if database not available
            await perfMonitor.logPerformanceData({
                type: 'error',
                data: errorData
            });
        }
    } catch (error) {
        // Fallback to file logging if database fails
        await perfMonitor.logPerformanceData({
            type: 'error',
            data: errorData
        });
    }
}

/**
 * 🆔 Generate unique error ID
 */
function generateErrorId(errorData) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5')
        .update(errorData.error.message + errorData.request.url)
        .digest('hex');
    return hash.substring(0, 8);
}

/**
 * 📊 Health Check Endpoint Data
 */
export const getHealthData = async (prisma) => {
    try {
        const systemMetrics = perfMonitor.collectSystemMetrics();
        
        let dbResponseTime = 0;
        let totalSessions = 0;
        let activeSessions = 0;
        let totalOperators = 0;
        let onlineOperators = 0;
        
        // Database health check (only if prisma is available)
        if (prisma) {
            try {
                const dbStart = performance.now();
                await prisma.$queryRaw`SELECT 1`;
                dbResponseTime = performance.now() - dbStart;
                
                // Get basic stats
                [totalSessions, activeSessions, totalOperators, onlineOperators] = await Promise.all([
                    prisma.chatSession.count(),
                    prisma.chatSession.count({ where: { status: 'ACTIVE' } }),
                    prisma.operator.count(),
                    prisma.operator.count({ where: { isOnline: true } })
                ]);
            } catch (dbError) {
                console.error('❌ Database health check failed:', dbError);
                dbResponseTime = -1;
            }
        }
        
        // API metrics
        const apiMetrics = Object.fromEntries(perfMonitor.metrics);
        
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            system: systemMetrics,
            database: {
                connected: dbResponseTime >= 0,
                responseTime: Math.round(dbResponseTime),
                status: dbResponseTime < 0 ? 'error' :
                       dbResponseTime < 100 ? 'excellent' : 
                       dbResponseTime < 500 ? 'good' : 'slow'
            },
            stats: {
                totalSessions,
                activeSessions,
                totalOperators,
                onlineOperators
            },
            api: {
                totalRequests: Array.from(perfMonitor.metrics.values())
                    .reduce((sum, m) => sum + m.calls, 0),
                avgResponseTime: Array.from(perfMonitor.metrics.values())
                    .reduce((sum, m) => sum + m.avgTime, 0) / perfMonitor.metrics.size || 0,
                errorRate: Array.from(perfMonitor.metrics.values())
                    .reduce((sum, m) => sum + (m.errors / m.calls || 0), 0) / perfMonitor.metrics.size || 0
            },
            alerts: perfMonitor.checkThresholds(systemMetrics)
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message,
            uptime: process.uptime()
        };
    }
};

/**
 * 🔧 Debug Information Collector
 */
export const getDebugInfo = async (req) => {
    const requestId = req.headers['x-request-id'] || generateErrorId({ 
        request: { url: req.originalUrl, timestamp: Date.now() } 
    });
    
    return {
        requestId,
        timestamp: new Date().toISOString(),
        request: {
            method: req.method,
            url: req.originalUrl,
            headers: req.headers,
            query: req.query,
            params: req.params,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        },
        system: perfMonitor.collectSystemMetrics(),
        session: req.session || null,
        operator: req.operator ? {
            id: req.operator.id,
            username: req.operator.username,
            isOnline: req.operator.isOnline
        } : null,
        database: {
            queryMetrics: prisma.getQueryMetrics ? prisma.getQueryMetrics() : 'Not available'
        }
    };
};

/**
 * 📈 Periodic Metrics Collection
 */
const startMetricsCollection = () => {
    setInterval(async () => {
        try {
            const metrics = perfMonitor.collectSystemMetrics();
            const alerts = perfMonitor.checkThresholds(metrics);
            
            if (alerts.length > 0) {
                console.warn('🚨 Performance Alerts:', alerts);
                perfMonitor.alerts.push(...alerts);
            }
            
            // Store metrics every 5 minutes
            await perfMonitor.logPerformanceData({
                type: 'system_metrics',
                data: metrics,
                alerts
            });
            
            // Clean up old alerts (keep last 100)
            if (perfMonitor.alerts.length > 100) {
                perfMonitor.alerts = perfMonitor.alerts.slice(-100);
            }
            
        } catch (error) {
            console.error('❌ Metrics collection error:', error);
        }
    }, 5 * 60 * 1000); // Every 5 minutes
};

/**
 * 🧹 Log Cleanup Utility
 */
export const cleanupLogs = async (daysToKeep = 7) => {
    try {
        const logsDir = path.join(process.cwd(), 'logs');
        const files = await fs.readdir(logsDir);
        const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
        
        for (const file of files) {
            const filePath = path.join(logsDir, file);
            const stats = await fs.stat(filePath);
            
            if (stats.mtime < cutoff) {
                await fs.unlink(filePath);
                console.log(`🗑️  Cleaned up old log file: ${file}`);
            }
        }
    } catch (error) {
        console.error('❌ Log cleanup error:', error);
    }
};

// Initialize monitoring (will be called from server.js)
// dbQueryMonitor(); // Now called with prisma parameter
startMetricsCollection();

// Clean up logs daily
setInterval(() => cleanupLogs(), 24 * 60 * 60 * 1000);

export default {
    PerformanceMonitor,
    responseTimeMonitor,
    errorTracker,
    getHealthData,
    getDebugInfo,
    cleanupLogs
};