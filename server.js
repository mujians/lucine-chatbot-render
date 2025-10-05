import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';

// Dependency Injection Container
import container from './config/container.js';

// Constants
import { ALLOWED_ORIGINS } from './config/constants.js';

// Logger
import logger from './utils/logger.js';

// Routes - chat.js ora è modulare in routes/chat/
import chatRouter from './routes/chat/index.js';
import operatorRouter from './routes/operators.js';
import ticketRouter from './routes/tickets.js';
import analyticsRouter from './routes/analytics.js';
import healthRouter from './routes/health.js';
import chatManagementRouter from './routes/chat-management.js';
import usersRouter from './routes/users.js';
import automatedTextsRouter from './routes/automated-texts.js';

// Security & Monitoring Middleware
import {
  apiLimiter,
  chatLimiter,
  loginLimiter,
  sanitizeInput,
  securityHeaders,
  securityLogger,
  detectSuspiciousActivity,
  setPrismaClient
} from './middleware/security.js';
import checkAdmin from './middleware/check-admin.js';

// API Response Standardization
import { standardizeResponse } from './utils/api-response.js';

// Services
import { healthService } from './services/health-service.js';
import { queueService } from './services/queue-service.js';
import { slaService } from './services/sla-service.js';
import { slaMonitoringService } from './services/sla-monitoring-service.js';
import { timeoutService } from './services/timeout-service.js';
import { operatorEventLogger } from './services/operator-event-logging.js';

// Database migration script
import { ensureTables } from './scripts/ensure-tables.js';
import { ensureAdminExists } from './scripts/ensure-admin.js';

// Load environment variables
dotenv.config();

// Initialize Prisma
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});

// Register Prisma in DI container (elimina export diretto)
container.register('prisma', prisma);

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - REQUIRED for Render deployment
app.set('trust proxy', 1);

// Create HTTP server
const server = createServer(app);

// WebSocket Server
const wss = new WebSocketServer({ server });

// Store active connections by operatorId
const operatorConnections = new Map();

// Store active widget connections by sessionId
const widgetConnections = new Map();

// ✅ Register in DI container (single source of truth)
container.register('operatorConnections', operatorConnections);
container.register('widgetConnections', widgetConnections);

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  logger.websocket.connected('new_connection');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      logger.debug('WEBSOCKET', 'Message received', { type: data.type });

      if (data.type === 'operator_auth') {
        // Associate connection with operator
        ws.operatorId = data.operatorId;
        ws.clientType = 'operator';
        operatorConnections.set(data.operatorId, ws);

        logger.websocket.connected(`operator_${data.operatorId}`);

        // Send confirmation
        ws.send(JSON.stringify({
          type: 'auth_success',
          operatorId: data.operatorId,
          timestamp: new Date().toISOString()
        }));
      } else if (data.type === 'widget_auth') {
        // Associate connection with widget sessionId
        ws.sessionId = data.sessionId;
        ws.clientType = 'widget';
        widgetConnections.set(data.sessionId, ws);

        logger.websocket.connected(`widget_${data.sessionId}`);

        // Send confirmation
        ws.send(JSON.stringify({
          type: 'auth_success',
          sessionId: data.sessionId,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      logger.error('WEBSOCKET', 'Message handling error', error);
    }
  });
  
  ws.on('close', () => {
    if (ws.operatorId) {
      operatorConnections.delete(ws.operatorId);
      logger.websocket.disconnected(`operator_${ws.operatorId}`);
    }
    if (ws.sessionId) {
      widgetConnections.delete(ws.sessionId);
      logger.websocket.disconnected(`widget_${ws.sessionId}`);
    }
  });
  
  ws.on('error', (error) => {
    logger.error('WEBSOCKET', 'WebSocket error', error);
  });
});

// ✅ notifyOperators è ora in utils/notifications.js
// Eliminato export per evitare dipendenze circolari

// Security & Monitoring Middleware
app.use(securityHeaders);
app.use(securityLogger);
app.use(detectSuspiciousActivity);
app.use(sanitizeInput);

// Basic Middleware
app.use(helmet({
  contentSecurityPolicy: false // We handle CSP in securityHeaders
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' })); // Reduced from 10mb - security improvement
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Standardized API responses
app.use(standardizeResponse);

// Apply security middleware
app.use(sanitizeInput);
app.use(detectSuspiciousActivity);

// CORS configuration - usa constants.js
app.use(cors({
  origin: (origin, callback) => {
    // Permetti richieste senza origin (Postman, mobile apps, etc.)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID']
}));

// Rate limiting (disabled for testing)
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // limit each IP to 100 requests per windowMs
//   message: 'Troppi tentativi, riprova più tardi'
// });
// app.use('/api/', limiter);

// Health check with comprehensive monitoring
app.get('/health', async (req, res) => {
  try {
    const healthData = await getHealthData(prisma);
    res.json(healthData);
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint (development only)
if (process.env.NODE_ENV !== 'production') {
  app.get('/debug', async (req, res) => {
    try {
      const debugInfo = await getDebugInfo(req);
      res.json(debugInfo);
    } catch (error) {
      res.status(500).json({
        error: 'Debug info collection failed',
        message: error.message
      });
    }
  });
}

// API Routes with rate limiting
app.use('/api/chat', chatLimiter, chatRouter);
app.use('/api/operators', apiLimiter, operatorRouter);
app.use('/api/tickets', apiLimiter, ticketRouter);
app.use('/api/analytics', apiLimiter, analyticsRouter);
app.use('/api/health', apiLimiter, healthRouter);
app.use('/api/chat-management', apiLimiter, chatManagementRouter);
app.use('/api/users', apiLimiter, checkAdmin, usersRouter);  // Admin-only route
app.use('/api/automated-texts', apiLimiter, automatedTextsRouter);

// Static dashboard - simplified configuration
app.use('/dashboard', express.static('public/dashboard'));

// Dashboard fallback routes for debugging
app.get('/dashboard/js/dashboard.js', (req, res) => {
  const filePath = path.join(process.cwd(), 'public/dashboard/js/dashboard.js');
  logger.debug('SERVER', 'Serving dashboard.js', { filePath });
  res.sendFile(filePath, (err) => {
    if (err) {
      logger.error('SERVER', 'Error serving dashboard.js', err);
      res.status(500).json({ error: 'Failed to serve dashboard.js', details: err.message });
    }
  });
});

app.get('/dashboard/css/dashboard.css', (req, res) => {
  const filePath = path.join(process.cwd(), 'public/dashboard/css/dashboard.css');
  logger.debug('SERVER', 'Serving dashboard.css', { filePath });
  res.sendFile(filePath, (err) => {
    if (err) {
      logger.error('SERVER', 'Error serving dashboard.css', err);
      res.status(500).json({ error: 'Failed to serve dashboard.css', details: err.message });
    }
  });
});

// Error handling middleware with comprehensive tracking

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    path: req.path 
  });
});

// Start server
async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.db.connected();
    
    // Inject prisma into security middleware (avoid circular imports)
    setPrismaClient(prisma);
    
    // Ensure all required tables exist
    await ensureTables();
    logger.info('DB', 'Database tables verified');

    // Ensure admin user exists with correct password
    // TEMPORARILY DISABLED - Will re-enable after migration is applied
    // await ensureAdminExists(prisma);
    logger.debug('SERVER', 'Admin check skipped (migration pending)');
    
    // Initialize services after database is ready
    await healthService.init(prisma);
    logger.health.started();
    
    await queueService.init(prisma);
    logger.info('QUEUE', 'Queue service initialized');
    
    // Legacy SLA service disabled - using slaMonitoringService instead
    // await slaService.init(prisma);
    // console.log('✅ SLA service initialized');

    await slaMonitoringService.init(prisma);
    logger.info('SLA', 'SLA Monitoring service initialized');

    await operatorEventLogger.init(prisma);
    logger.info('OPERATORS', 'Operator Event Logger initialized');

    // Start timeout service
    timeoutService.start();
    logger.info('SERVER', 'Timeout service started');

    // Setup knowledge base auto-reload
    const { setupAutoReload } = await import('./utils/knowledge.js');
    setupAutoReload();
    logger.info('AI', 'Knowledge base auto-reload enabled');

    // Start queue cleanup cron job (every 10 minutes)
    setInterval(async () => {
      try {
        const cleanedCount = await queueService.cleanupStaleEntries();
        if (cleanedCount > 0) {
          logger.info('QUEUE', 'Queue cleanup cron completed', { cleanedCount });
        }
      } catch (error) {
        logger.error('QUEUE', 'Queue cleanup cron error', error);
      }
    }, 10 * 60 * 1000); // 10 minutes
    logger.info('QUEUE', 'Queue cleanup cron job started (runs every 10 minutes)');

    logger.info('SERVER', 'All services initialized successfully');

    // Database ready for use

    server.listen(PORT, '0.0.0.0', () => {
      const isProduction = process.env.NODE_ENV === 'production';
      const baseUrl = isProduction
        ? (process.env.RENDER_EXTERNAL_URL || 'https://lucine-chatbot.onrender.com')
        : `http://localhost:${PORT}`;
      const wsUrl = isProduction
        ? baseUrl.replace('https://', 'wss://')
        : `ws://localhost:${PORT}`;

      logger.info('SERVER', 'Server started', {
        port: PORT,
        environment: process.env.NODE_ENV,
        dashboard: `${baseUrl}/dashboard`,
        websocket: wsUrl
      });
    });
  } catch (error) {
    logger.error('SERVER', 'Failed to start server', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SERVER', 'SIGTERM received, shutting down gracefully');

  // Cleanup services
  await healthService.cleanup();
  await queueService.cleanup();
  await slaService.cleanup();
  await slaMonitoringService.cleanup();

  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SERVER', 'SIGINT received, shutting down gracefully');

  // Cleanup services
  await healthService.cleanup();
  await queueService.cleanup();
  await slaService.cleanup();
  await slaMonitoringService.cleanup();

  await prisma.$disconnect();
  process.exit(0);
});

startServer();