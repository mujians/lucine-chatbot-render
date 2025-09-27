import express from 'express';
import { prisma } from '../server.js';
import { 
  authenticateToken, 
  validateSession, 
  TokenManager,
  loginLimiter
} from '../middleware/security.js';

const router = express.Router();

// Simple test endpoint
router.post('/test-login', async (req, res) => {
  try {
    console.log('🧪 Testing login functionality...');
    const { username, password } = req.body;
    
    if (username === 'admin' && password === 'admin123') {
      res.json({ success: true, message: 'Test login OK' });
    } else {
      res.status(401).json({ success: false, message: 'Test login failed' });
    }
  } catch (error) {
    console.error('❌ Test login error:', error);
    res.status(500).json({ success: false, message: 'Test error', details: error.message });
  }
});

// Login without rate limiting for debugging
router.post('/login-debug', async (req, res) => {
  try {
    console.log('🐛 Debug login attempt...');
    const { username, password } = req.body;
    
    // Login semplificato: admin/admin123
    if (username === 'admin' && password === 'admin123') {
      console.log('🔑 Credentials OK, checking database...');
      
      // Trova o crea operatore admin (con solo i campi che esistono)
      let operator = await prisma.operator.findUnique({
        where: { username: 'admin' },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          passwordHash: true,
          isActive: true,
          isOnline: true,
          lastSeen: true,
          createdAt: true
        }
      });
      
      console.log('👤 Operator found:', operator ? 'YES' : 'NO');

      if (!operator) {
        console.log('🆕 Creating new operator...');
        operator = await prisma.operator.create({
          data: {
            username: 'admin',
            email: 'supporto@lucinedinatale.it',
            name: 'Lucy - Assistente Specializzato',
            passwordHash: 'demo',
            isActive: true,
            isOnline: true
          },
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
            passwordHash: true,
            isActive: true,
            isOnline: true,
            lastSeen: true,
            createdAt: true
          }
        });
        console.log('✅ Operator created successfully');
      } else {
        console.log('📝 Updating existing operator...');
        await prisma.operator.update({
          where: { id: operator.id },
          data: { 
            isOnline: true,
            isActive: true
          }
        });
        console.log('✅ Operator updated successfully');
      }

      res.json({
        success: true,
        operator: {
          id: operator.id,
          username: operator.username,
          name: operator.name,
          displayName: operator.name,
          avatar: '👤',
          email: operator.email,
          isOnline: true,
          isActive: true
        },
        message: 'Debug login successful'
      });

    } else {
      res.status(401).json({ 
        success: false,
        message: 'Credenziali non valide. Usa admin/admin123' 
      });
    }

  } catch (error) {
    console.error('❌ Debug login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Debug login error',
      error: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Get operator status
router.get('/status', async (req, res) => {
  try {
    const operators = await prisma.operator.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        isOnline: true,
        isActive: true,
        lastSeen: true
      }
    });

    const onlineCount = operators.filter(op => op.isOnline).length;

    res.json({
      online_operators: onlineCount,
      operators,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch operator status' });
  }
});

// Operator login (semplificato per demo)
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Login semplificato: admin/admin123
    if (username === 'admin' && password === 'admin123') {
      // Trova o crea operatore admin (con solo i campi che esistono)
      let operator = await prisma.operator.findUnique({
        where: { username: 'admin' },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          passwordHash: true,
          isActive: true,
          isOnline: true,
          lastSeen: true,
          createdAt: true
        }
      });

      if (!operator) {
        operator = await prisma.operator.create({
          data: {
            username: 'admin',
            email: 'supporto@lucinedinatale.it',
            name: 'Lucy - Assistente Specializzato',
            passwordHash: 'demo', // In produzione usare bcrypt
            isActive: true,
            isOnline: true
          },
          select: {
            id: true,
            username: true,
            email: true,
            name: true,
            passwordHash: true,
            isActive: true,
            isOnline: true,
            lastSeen: true,
            createdAt: true
          }
        });
      } else {
        // Update online status and activate
        await prisma.operator.update({
          where: { id: operator.id },
          data: { 
            isOnline: true,
            isActive: true
          }
        });
      }

      res.json({
        success: true,
        operator: {
          id: operator.id,
          username: operator.username,
          name: operator.name,
          displayName: operator.name,
          avatar: '👤',
          email: operator.email,
          isOnline: true,
          isActive: true
        },
        message: 'Login successful'
      });

    } else {
      res.status(401).json({ 
        success: false,
        message: 'Credenziali non valide. Usa admin/admin123' 
      });
    }

  } catch (error) {
    console.error('❌ Login error details:', error);
    res.status(500).json({ 
      success: false,
      message: 'Errore del server durante il login',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

// Get pending chats
router.get('/pending-chats', async (req, res) => {
  try {
    const pendingChats = await prisma.chatSession.findMany({
      where: {
        status: 'ACTIVE',
        operatorChats: {
          none: {}
        }
      },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 5
        }
      }
    });

    res.json({
      pending: pendingChats.map(chat => ({
        sessionId: chat.sessionId,
        startedAt: chat.startedAt,
        lastActivity: chat.lastActivity,
        lastMessage: chat.messages[0]?.message
      })),
      count: pendingChats.length
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending chats' });
  }
});

// Take chat
router.post('/take-chat', authenticateToken, validateSession, async (req, res) => {
  try {
    const { sessionId, operatorId } = req.body;

    // Verifica che la sessione esista
    const sessionExists = await prisma.chatSession.findUnique({
      where: { sessionId }
    });

    if (!sessionExists) {
      console.error('❌ Session not found:', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check if chat already taken
    const existing = await prisma.operatorChat.findFirst({
      where: {
        sessionId,
        endedAt: null
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Chat already taken' });
    }

    // Create operator chat
    const operatorChat = await prisma.operatorChat.create({
      data: {
        sessionId,
        operatorId
      }
    });

    // Update session status
    await prisma.chatSession.update({
      where: { sessionId },
      data: { status: 'WITH_OPERATOR' }
    });

    // Get operator info
    const operator = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { name: true }
    });

    // Add system message
    await prisma.message.create({
      data: {
        sessionId,
        sender: 'SYSTEM',
        message: `👤 ${operator.name} si è unito alla chat\n✨ Pronto ad aiutarti!`
      }
    });

    res.json({
      success: true,
      chatId: operatorChat.id,
      operator: operator.name
    });

  } catch (error) {
    console.error('❌ Take-chat error:', {
      message: error.message,
      code: error.code,
      meta: error.meta,
      sessionId,
      operatorId
    });
    
    // Errori più specifici
    if (error.code === 'P2025') {
      return res.status(404).json({ 
        error: 'Session or operator not found',
        details: error.message 
      });
    }
    
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        error: 'Chat already assigned',
        details: error.message 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to take chat',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get messages for user polling (frontend → backend)
router.get('/messages/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { since } = req.query; // Timestamp per messaggi più recenti
    
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 10000); // Ultimi 10 secondi se non specificato
    
    const messages = await prisma.message.findMany({
      where: {
        sessionId,
        sender: 'OPERATOR',
        timestamp: {
          gt: sinceDate
        }
      },
      include: {
        _count: true
      },
      orderBy: { timestamp: 'asc' }
    });

    // Aggiungi operatorName dal metadata
    const messagesWithOperator = messages.map(msg => ({
      id: msg.id,
      sender: msg.sender,
      content: msg.message,
      timestamp: msg.timestamp,
      operatorId: msg.metadata?.operatorId || null,
      operatorName: msg.metadata?.operatorName || 'Operatore'
    }));

    res.json({
      success: true,
      messages: messagesWithOperator,
      count: messages.length
    });

  } catch (error) {
    console.error('Messages polling error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// End chat
router.post('/end-chat', async (req, res) => {
  try {
    const { sessionId, operatorId, rating, notes } = req.body;

    // End operator chat
    const operatorChat = await prisma.operatorChat.updateMany({
      where: {
        sessionId,
        operatorId,
        endedAt: null
      },
      data: {
        endedAt: new Date(),
        rating,
        notes
      }
    });

    // Update session status
    await prisma.chatSession.update({
      where: { sessionId },
      data: { status: 'ENDED' }
    });

    // Add system message
    await prisma.message.create({
      data: {
        sessionId,
        sender: 'SYSTEM',
        message: 'Chat terminata'
      }
    });

    res.json({
      success: true,
      message: 'Chat ended successfully'
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to end chat' });
  }
});

// Operator logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { operatorId } = req.body;

    console.log('🚪 Logout request for operator:', operatorId);

    // Validation
    if (!operatorId) {
      return res.status(400).json({ error: 'OperatorId is required' });
    }

    // Check if operator exists
    const existingOperator = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { id: true, isActive: true }
    });

    if (!existingOperator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    // Update to offline
    await prisma.operator.update({
      where: { id: operatorId },
      data: {
        isOnline: false,
        lastSeen: new Date()
      }
    });

    console.log('✅ Operator logged out:', existingOperator.name);

    res.json({ 
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({ 
      error: 'Logout failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update operator status (online/offline)
router.put('/status', authenticateToken, async (req, res) => {
  try {
    const { operatorId, isOnline } = req.body;

    console.log('🔄 Status update request:', { operatorId, isOnline });

    // Validation
    if (!operatorId) {
      return res.status(400).json({ error: 'OperatorId is required' });
    }

    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({ error: 'isOnline must be boolean' });
    }

    // Check if operator exists
    const existingOperator = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { id: true, isActive: true }
    });

    if (!existingOperator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    // Update status
    const updatedOperator = await prisma.operator.update({
      where: { id: operatorId },
      data: {
        isOnline,
        lastSeen: new Date()
      }
    });

    console.log('✅ Status updated successfully:', updatedOperator.name, isOnline ? 'ONLINE' : 'OFFLINE');

    res.json({ 
      success: true,
      operator: {
        id: updatedOperator.id,
        name: updatedOperator.name,
        isOnline: updatedOperator.isOnline,
        lastSeen: updatedOperator.lastSeen
      }
    });

  } catch (error) {
    console.error('❌ Status update error:', error);
    res.status(500).json({ 
      error: 'Failed to update status',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get pending sessions for dashboard (solo database PostgreSQL)
router.get('/pending-sessions', async (req, res) => {
  try {
    // Sessioni che aspettano risposta operatore (status WITH_OPERATOR con operatorChat attivo)
    const pendingChats = await prisma.chatSession.findMany({
      where: {
        status: 'WITH_OPERATOR',
        operatorChats: {
          some: {
            endedAt: null // Deve avere un operatorChat attivo
          }
        }
      },
      include: {
        messages: {
          where: { sender: 'USER' },
          orderBy: { timestamp: 'desc' },
          take: 1
        },
        operatorChats: {
          where: { endedAt: null },
          include: {
            operator: {
              select: { id: true, name: true }
            }
          }
        }
      },
      orderBy: { lastActivity: 'desc' }
    });

    const pending_sessions = pendingChats.map(chat => ({
      sessionId: chat.sessionId,
      originalQuestion: chat.messages[0]?.message || 'Richiesta supporto',
      handover_time: chat.lastActivity.getTime(),
      timestamp: chat.lastActivity.toISOString(),
      operator: chat.operatorChats[0]?.operator || null
    }));

    console.log('📋 Pending sessions found:', pending_sessions.length);

    res.json({
      success: true,
      pending_sessions,
      total_pending: pending_sessions.length
    });

  } catch (error) {
    console.error('Error getting pending sessions:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get pending sessions',
      pending_sessions: [],
      total_pending: 0
    });
  }
});

// Send message from user to operator (frontend → backend)
router.post('/send', async (req, res) => {
  try {
    const { sessionId, message, sender } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'SessionId and message required' });
    }

    // Save user message directly
    const savedMessage = await prisma.message.create({
      data: {
        sessionId,
        sender: 'USER',
        message
      }
    });

    // Update session last activity
    await prisma.chatSession.update({
      where: { sessionId },
      data: { lastActivity: new Date() }
    });

    res.json({
      success: true,
      messageId: savedMessage.id,
      timestamp: savedMessage.timestamp
    });

  } catch (error) {
    console.error('Send user message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Send message from operator to user (dashboard → backend)
router.post('/send-message', authenticateToken, validateSession, async (req, res) => {
  try {
    const { sessionId, operatorId, message } = req.body;
    
    console.log('📤 Operator send message request:', { sessionId, operatorId, messageLength: message?.length });
    
    if (!sessionId || !operatorId || !message) {
      return res.status(400).json({ error: 'SessionId, operatorId and message required' });
    }

    // Sanitize message
    const sanitizedMessage = message.trim();
    if (sanitizedMessage.length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // Verify operator is assigned to this session
    const operatorChat = await prisma.operatorChat.findFirst({
      where: {
        sessionId,
        operatorId,
        endedAt: null
      },
      include: {
        operator: true
      }
    });

    if (!operatorChat) {
      return res.status(403).json({ error: 'Operator not assigned to this session' });
    }

    // Save operator message
    const savedMessage = await prisma.message.create({
      data: {
        sessionId,
        sender: 'OPERATOR',
        message: sanitizedMessage,
        metadata: {
          operatorId,
          operatorName: operatorChat.operator.name
        }
      }
    });

    // Update session last activity
    await prisma.chatSession.update({
      where: { sessionId },
      data: { lastActivity: new Date() }
    });

    res.json({
      success: true,
      message: {
        id: savedMessage.id,
        sender: 'OPERATOR',
        message: savedMessage.message,
        timestamp: savedMessage.timestamp,
        operator: {
          id: operatorChat.operator.id,
          name: operatorChat.operator.name
        }
      }
    });

  } catch (error) {
    console.error('Send operator message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get chat history for dashboard
router.get('/chat-history', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, sessionId } = req.query;
    const offset = (page - 1) * limit;

    // Se è richiesta una singola sessione
    if (sessionId) {
      const session = await prisma.chatSession.findUnique({
        where: { sessionId },
        include: {
          messages: {
            orderBy: { timestamp: 'asc' }
          },
          operatorChats: {
            include: {
              operator: {
                select: { id: true, name: true, username: true }
              }
            }
          }
        }
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      return res.json({
        sessions: [{
          sessionId: session.sessionId,
          status: session.status,
          startedAt: session.startedAt,
          lastActivity: session.lastActivity,
          messageCount: session.messages.length,
          lastMessage: session.messages[session.messages.length - 1],
          operator: session.operatorChats[0]?.operator || null,
          messages: session.messages
        }]
      });
    }

    const where = status ? { status } : {};

    const chatSessions = await prisma.chatSession.findMany({
      where,
      include: {
        messages: {
          orderBy: { timestamp: 'asc' }
        },
        operatorChats: {
          include: {
            operator: {
              select: { id: true, name: true, username: true }
            }
          }
        }
      },
      orderBy: { lastActivity: 'desc' },
      take: parseInt(limit),
      skip: offset
    });

    const total = await prisma.chatSession.count({ where });

    res.json({
      sessions: chatSessions.map(session => ({
        sessionId: session.sessionId,
        status: session.status,
        startedAt: session.startedAt,
        lastActivity: session.lastActivity,
        messageCount: session.messages.length,
        lastMessage: session.messages[session.messages.length - 1],
        operator: session.operatorChats[0]?.operator || null,
        messages: session.messages
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Chat history error:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Update operator profile (name, email, etc.)
router.put('/profile', async (req, res) => {
  try {
    const { operatorId, name, email } = req.body;

    console.log('👤 Profile update request:', { operatorId, name, email });

    // Validation
    if (!operatorId) {
      return res.status(400).json({ error: 'OperatorId is required' });
    }

    // Check if operator exists
    const existingOperator = await prisma.operator.findUnique({
      where: { id: operatorId },
      select: { id: true, isActive: true }
    });

    if (!existingOperator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    // Update profile
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;

    const updatedOperator = await prisma.operator.update({
      where: { id: operatorId },
      data: updateData
    });

    console.log('✅ Profile updated:', updatedOperator.name);

    res.json({ 
      success: true,
      operator: {
        id: updatedOperator.id,
        name: updatedOperator.name,
        email: updatedOperator.email,
        username: updatedOperator.username
      }
    });

  } catch (error) {
    console.error('❌ Profile update error:', error);
    res.status(500).json({ 
      error: 'Failed to update profile',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Set operator status (online/offline)
router.post('/set-status', async (req, res) => {
  try {
    const { operatorId, isOnline, isActive } = req.body;

    const operator = await prisma.operator.update({
      where: { id: operatorId },
      data: { 
        isOnline: isOnline !== undefined ? isOnline : true,
        isActive: isActive !== undefined ? isActive : true,
        lastSeen: new Date()
      }
    });

    res.json({
      success: true,
      operator: {
        id: operator.id,
        name: operator.name,
        isOnline: operator.isOnline,
        isActive: operator.isActive
      }
    });

  } catch (error) {
    console.error('Set status error:', error);
    res.status(500).json({ error: 'Failed to update operator status' });
  }
});

export default router;