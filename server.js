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

// Routes - chat.js ora è modulare in routes/chat/
import chatRouter from './routes/chat/index.js';
import operatorRouter from './routes/operators.js';
import ticketRouter from './routes/tickets.js';
import analyticsRouter from './routes/analytics.js';
import healthRouter from './routes/health.js';
import chatManagementRouter from './routes/chat-management.js';

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

// API Response Standardization
import { standardizeResponse } from './utils/api-response.js';

// Services
import { healthService } from './services/health-service.js';
import { queueService } from './services/queue-service.js';
import { slaService } from './services/sla-service.js';
import { timeoutService } from './services/timeout-service.js';

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

// Create HTTP server
const server = createServer(app);

// WebSocket Server
const wss = new WebSocketServer({ server });

// Store active connections by operatorId
const operatorConnections = new Map();

// Register in DI container invece di export
container.register('operatorConnections', operatorConnections);

// Backward compatibility per services che usano global
global.operatorConnections = operatorConnections;

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('🔌 New WebSocket connection');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 WebSocket message:', data);
      
      if (data.type === 'operator_auth') {
        // Associate connection with operator
        ws.operatorId = data.operatorId;
        operatorConnections.set(data.operatorId, ws);
        
        console.log(`👤 Operator ${data.operatorId} connected via WebSocket`);
        
        // Send confirmation
        ws.send(JSON.stringify({
          type: 'auth_success',
          operatorId: data.operatorId,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('❌ WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    if (ws.operatorId) {
      operatorConnections.delete(ws.operatorId);
      console.log(`👋 Operator ${ws.operatorId} disconnected`);
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
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

// Static dashboard - simplified configuration
app.use('/dashboard', express.static('public/dashboard'));

// Dashboard fallback routes for debugging
app.get('/dashboard/js/dashboard.js', (req, res) => {
  const filePath = path.join(process.cwd(), 'public/dashboard/js/dashboard.js');
  console.log(`📁 Serving dashboard.js from: ${filePath}`);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('❌ Error serving dashboard.js:', err);
      res.status(500).json({ error: 'Failed to serve dashboard.js', details: err.message });
    }
  });
});

app.get('/dashboard/css/dashboard.css', (req, res) => {
  const filePath = path.join(process.cwd(), 'public/dashboard/css/dashboard.css');
  console.log(`📁 Serving dashboard.css from: ${filePath}`);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('❌ Error serving dashboard.css:', err);
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
    console.log('✅ Database connected');
    
    // Inject prisma into security middleware (avoid circular imports)
    setPrismaClient(prisma);
    
    // Ensure all required tables exist
    await ensureTables();
    console.log('✅ Database tables verified');

    // Ensure admin user exists with correct password
    await ensureAdminExists(prisma);
    console.log('✅ Admin user verified');
    
    // Initialize services after database is ready
    await healthService.init(prisma);
    console.log('✅ Health monitoring initialized');
    
    await queueService.init(prisma);
    console.log('✅ Queue service initialized');
    
    await slaService.init(prisma);
    console.log('✅ SLA service initialized');
    
    // Start timeout service
    timeoutService.start();
    console.log('✅ Timeout service started');

    // Setup knowledge base auto-reload
    const { setupAutoReload } = await import('./utils/knowledge.js');
    setupAutoReload();
    console.log('✅ Knowledge base auto-reload enabled');

    console.log('✅ All services initialized');

    // Database ready for use

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
      console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
      console.log(`🔌 WebSocket Server: ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  
  // Cleanup services
  await healthService.cleanup();
  await queueService.cleanup();
  await slaService.cleanup();
  
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  
  // Cleanup services
  await healthService.cleanup();
  await queueService.cleanup();
  await slaService.cleanup();
  
  await prisma.$disconnect();
  process.exit(0);
});

startServer();