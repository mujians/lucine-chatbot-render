import express from 'express';
import { prisma } from '../server.js';

const router = express.Router();

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
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Login semplificato: admin/admin123
    if (username === 'admin' && password === 'admin123') {
      // Trova o crea operatore admin
      let operator = await prisma.operator.findUnique({
        where: { username: 'admin' }
      });

      if (!operator) {
        operator = await prisma.operator.create({
          data: {
            username: 'admin',
            email: 'supporto@lucinedinatale.it',
            name: 'Lucy Support',
            displayName: 'Lucy - Assistente Specializzato',
            avatar: '👩‍💼',
            passwordHash: 'demo', // In produzione usare bcrypt
            isActive: true,
            isOnline: true,
            specialization: 'Biglietti e Informazioni Generali'
          }
        });
      } else {
        // Update online status and activate
        await prisma.operator.update({
          where: { id: operator.id },
          data: { 
            isOnline: true,
            isActive: true,
            lastSeen: new Date()
          }
        });
      }

      res.json({
        success: true,
        operator: {
          id: operator.id,
          username: operator.username,
          name: operator.name,
          displayName: operator.displayName || operator.name,
          avatar: operator.avatar || '👤',
          email: operator.email,
          specialization: operator.specialization,
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
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Errore del server durante il login' 
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
router.post('/take-chat', async (req, res) => {
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
      select: { name: true, displayName: true, avatar: true, specialization: true }
    });

    // Add system message
    await prisma.message.create({
      data: {
        sessionId,
        sender: 'SYSTEM',
        message: `${operator.avatar || '👤'} ${operator.displayName || operator.name} si è unito alla chat\n✨ ${operator.specialization || 'Pronto ad aiutarti!'}`
      }
    });

    res.json({
      success: true,
      chatId: operatorChat.id,
      operator: operator.name
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to take chat' });
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
router.post('/logout', async (req, res) => {
  try {
    const { operatorId } = req.body;

    await prisma.operator.update({
      where: { id: operatorId },
      data: {
        isOnline: false,
        lastSeen: new Date()
      }
    });

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Update operator status (online/offline)
router.put('/status', async (req, res) => {
  try {
    const { operatorId, isOnline } = req.body;

    await prisma.operator.update({
      where: { id: operatorId },
      data: {
        isOnline,
        lastSeen: new Date()
      }
    });

    res.json({ success: true });

  } catch (error) {
    res.status(500).json({ error: 'Failed to update status' });
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
router.post('/send-message', async (req, res) => {
  try {
    const { sessionId, operatorId, message } = req.body;
    
    if (!sessionId || !operatorId || !message) {
      return res.status(400).json({ error: 'SessionId, operatorId and message required' });
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
        message,
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