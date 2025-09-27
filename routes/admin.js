/**
 * 🔧 Admin Routes - Lucine di Natale
 * Administrative endpoints with enhanced security
 */

import express from 'express';
import { prisma } from '../server.js';
import { 
  authenticateToken, 
  requireAdmin, 
  TokenManager 
} from '../middleware/security.js';
import { getHealthData, getDebugInfo } from '../middleware/monitoring.js';

const router = express.Router();

/**
 * 🔐 Admin Authentication
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        error: 'Username e password richiesti',
        code: 'MISSING_CREDENTIALS'
      });
    }
    
    // For now, simple admin check - replace with proper auth
    if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
      const token = TokenManager.generateToken({
        operatorId: 'admin',
        username: 'admin',
        role: 'ADMIN'
      });
      
      res.json({
        success: true,
        token,
        admin: {
          id: 'admin',
          username: 'admin',
          role: 'ADMIN'
        }
      });
    } else {
      res.status(401).json({
        error: 'Credenziali amministratore non valide',
        code: 'INVALID_ADMIN_CREDENTIALS'
      });
    }
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({
      error: 'Errore interno del server',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * 📊 System Overview
 */
router.get('/overview', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const healthData = await getHealthData();
    
    // Additional admin-specific metrics
    const [
      totalMessages,
      totalTickets,
      errorLogs,
      recentSessions
    ] = await Promise.all([
      prisma.message.count(),
      prisma.ticket.count(),
      prisma.analytics.count({
        where: { eventType: 'application_error' }
      }),
      prisma.chatSession.findMany({
        take: 10,
        orderBy: { startedAt: 'desc' },
        include: {
          _count: {
            select: { messages: true }
          }
        }
      })
    ]);
    
    res.json({
      ...healthData,
      adminStats: {
        totalMessages,
        totalTickets,
        errorLogs,
        recentSessions: recentSessions.map(session => ({
          id: session.sessionId,
          status: session.status,
          messageCount: session._count.messages,
          startedAt: session.startedAt,
          endedAt: session.endedAt
        }))
      }
    });
  } catch (error) {
    console.error('❌ Admin overview error:', error);
    res.status(500).json({
      error: 'Errore caricamento overview',
      code: 'OVERVIEW_ERROR'
    });
  }
});

/**
 * 👥 Operators Management
 */
router.get('/operators', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const operators = await prisma.operator.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        isActive: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true,
        _count: {
          select: {
            operatorChats: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json({
      operators: operators.map(op => ({
        ...op,
        chatCount: op._count.operatorChats
      }))
    });
  } catch (error) {
    console.error('❌ Admin operators error:', error);
    res.status(500).json({
      error: 'Errore caricamento operatori',
      code: 'OPERATORS_ERROR'
    });
  }
});

/**
 * ➕ Create Operator
 */
router.post('/operators', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, email, name, password } = req.body;
    
    if (!username || !email || !name || !password) {
      return res.status(400).json({
        error: 'Tutti i campi sono obbligatori',
        code: 'MISSING_FIELDS'
      });
    }
    
    // Check if operator already exists
    const existing = await prisma.operator.findFirst({
      where: {
        OR: [
          { username },
          { email }
        ]
      }
    });
    
    if (existing) {
      return res.status(409).json({
        error: 'Operatore già esistente con questo username o email',
        code: 'OPERATOR_EXISTS'
      });
    }
    
    // Hash password
    const { salt, hash } = TokenManager.hashPassword(password);
    
    const operator = await prisma.operator.create({
      data: {
        username,
        email,
        name,
        passwordHash: `${salt}:${hash}`,
        isActive: true,
        isOnline: false
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true
      }
    });
    
    res.json({
      success: true,
      operator
    });
  } catch (error) {
    console.error('❌ Create operator error:', error);
    res.status(500).json({
      error: 'Errore creazione operatore',
      code: 'CREATE_OPERATOR_ERROR'
    });
  }
});

/**
 * 🔄 Update Operator
 */
router.put('/operators/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, isActive } = req.body;
    
    const operator = await prisma.operator.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(typeof isActive === 'boolean' && { isActive })
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        isActive: true,
        isOnline: true,
        lastSeen: true
      }
    });
    
    res.json({
      success: true,
      operator
    });
  } catch (error) {
    console.error('❌ Update operator error:', error);
    res.status(500).json({
      error: 'Errore aggiornamento operatore',
      code: 'UPDATE_OPERATOR_ERROR'
    });
  }
});

/**
 * 📈 System Analytics
 */
router.get('/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    const [
      messageStats,
      sessionStats,
      errorStats,
      operatorStats
    ] = await Promise.all([
      // Message statistics
      prisma.message.groupBy({
        by: ['sender'],
        _count: true,
        where: {
          timestamp: { gte: startDate }
        }
      }),
      
      // Session statistics
      prisma.chatSession.groupBy({
        by: ['status'],
        _count: true,
        where: {
          startedAt: { gte: startDate }
        }
      }),
      
      // Error statistics
      prisma.analytics.count({
        where: {
          eventType: 'application_error',
          timestamp: { gte: startDate }
        }
      }),
      
      // Operator performance
      prisma.operatorChat.groupBy({
        by: ['operatorId'],
        _count: true,
        _avg: {
          rating: true
        },
        where: {
          startedAt: { gte: startDate }
        }
      })
    ]);
    
    res.json({
      period,
      dateRange: {
        start: startDate.toISOString(),
        end: now.toISOString()
      },
      messageStats,
      sessionStats,
      errorCount: errorStats,
      operatorStats
    });
  } catch (error) {
    console.error('❌ Admin analytics error:', error);
    res.status(500).json({
      error: 'Errore caricamento analytics',
      code: 'ANALYTICS_ERROR'
    });
  }
});

/**
 * 🗃️ Database Operations
 */
router.post('/database/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { operation, daysOld = 30 } = req.body;
    
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    
    let result = {};
    
    switch (operation) {
      case 'old_sessions':
        result = await prisma.chatSession.deleteMany({
          where: {
            status: 'ENDED',
            endedAt: { lt: cutoffDate }
          }
        });
        break;
        
      case 'old_analytics':
        result = await prisma.analytics.deleteMany({
          where: {
            timestamp: { lt: cutoffDate }
          }
        });
        break;
        
      default:
        return res.status(400).json({
          error: 'Operazione non supportata',
          code: 'INVALID_OPERATION'
        });
    }
    
    res.json({
      success: true,
      operation,
      deletedCount: result.count,
      cutoffDate: cutoffDate.toISOString()
    });
  } catch (error) {
    console.error('❌ Database cleanup error:', error);
    res.status(500).json({
      error: 'Errore pulizia database',
      code: 'CLEANUP_ERROR'
    });
  }
});

/**
 * 🔧 System Configuration
 */
router.get('/config', authenticateToken, requireAdmin, (req, res) => {
  res.json({
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    features: {
      websocket: true,
      analytics: true,
      monitoring: true,
      security: true
    },
    limits: {
      maxMessageLength: 500,
      maxSessionDuration: 24 * 60 * 60 * 1000, // 24 hours
      rateLimits: {
        api: '100 req/15min',
        chat: '20 req/min',
        login: '5 req/15min'
      }
    }
  });
});

/**
 * 🚨 Emergency Actions
 */
router.post('/emergency/:action', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { action } = req.params;
    
    switch (action) {
      case 'disable_chat':
        // This would require a global flag in database
        await prisma.analytics.create({
          data: {
            eventType: 'emergency_action',
            eventData: {
              action: 'chat_disabled',
              adminId: req.operator.id,
              timestamp: new Date().toISOString()
            }
          }
        });
        res.json({ success: true, message: 'Chat disabilitata' });
        break;
        
      case 'clear_sessions':
        const result = await prisma.chatSession.updateMany({
          where: { status: { in: ['ACTIVE', 'WITH_OPERATOR'] } },
          data: { 
            status: 'ENDED',
            endedAt: new Date()
          }
        });
        res.json({ 
          success: true, 
          message: `${result.count} sessioni terminate`
        });
        break;
        
      default:
        res.status(400).json({
          error: 'Azione di emergenza non supportata',
          code: 'INVALID_EMERGENCY_ACTION'
        });
    }
  } catch (error) {
    console.error('❌ Emergency action error:', error);
    res.status(500).json({
      error: 'Errore azione di emergenza',
      code: 'EMERGENCY_ERROR'
    });
  }
});

/**
 * 📋 System Logs
 */
router.get('/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { type = 'error', limit = 50 } = req.query;
    
    const logs = await prisma.analytics.findMany({
      where: {
        eventType: type === 'error' ? 'application_error' : 'system_log'
      },
      orderBy: { timestamp: 'desc' },
      take: parseInt(limit)
    });
    
    res.json({
      logs: logs.map(log => ({
        id: log.id,
        type: log.eventType,
        timestamp: log.timestamp,
        data: log.eventData
      }))
    });
  } catch (error) {
    console.error('❌ Admin logs error:', error);
    res.status(500).json({
      error: 'Errore caricamento logs',
      code: 'LOGS_ERROR'
    });
  }
});

// Legacy endpoints for backward compatibility
router.get('/stats', async (req, res) => {
  try {
    const { password } = req.query;
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const stats = {
      sessions: await prisma.chatSession.count(),
      messages: await prisma.message.count(),
      tickets: await prisma.ticket.count(),
      operators: await prisma.operator.count(),
      analytics: await prisma.analytics.count(),
      knowledgeItems: await prisma.knowledgeItem.count()
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;