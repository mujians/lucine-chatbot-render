import express from 'express';
import container from '../config/container.js';
import {
  authenticateToken,
  validateSession,
  TokenManager,
  loginLimiter
} from '../middleware/security.js';

const router = express.Router();

// Helper to get prisma (lazy load)
const getPrisma = () => container.get('prisma');




// Operator login (semplificato per demo)
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find operator first
    const operator = await getPrisma().operator.findUnique({
      where: { username },
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

    // If operator doesn't exist and it's admin, create it
    if (!operator && username === 'admin') {
      const hashedPassword = await TokenManager.hashPassword(process.env.ADMIN_PASSWORD || 'admin123');
      
      const newOperator = await getPrisma().operator.create({
        data: {
          username: 'admin',
          email: 'supporto@lucinedinatale.it',
          name: 'Lucy - Assistente Specializzato',
          passwordHash: hashedPassword,
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

      // Generate JWT token for new operator
      const token = TokenManager.generateToken({
        operatorId: newOperator.id,
        username: newOperator.username,
        name: newOperator.name
      });

      res.json({
        success: true,
        token,
        operator: {
          id: newOperator.id,
          username: newOperator.username,
          name: newOperator.name,
          avatar: '👤',
          email: newOperator.email,
          isOnline: true,
          isActive: true
        },
        message: 'Admin account created and logged in'
      });
      return;
    }

    // Verify operator exists and is active
    if (!operator || !operator.isActive) {
      return res.status(401).json({ 
        success: false,
        message: 'Operatore non trovato o disattivato' 
      });
    }

    // Verify password with bcrypt
    const isValidPassword = await TokenManager.verifyPassword(password, operator.passwordHash);
    
    if (isValidPassword) {
      // Update online status
      await getPrisma().operator.update({
        where: { id: operator.id },
        data: { 
          isOnline: true,
          lastSeen: new Date()
        }
      });

      // Generate JWT token
      const token = TokenManager.generateToken({
        operatorId: operator.id,
        username: operator.username,
        name: operator.name
      });

      // 📋 Try to auto-assign chat from queue on login
      let assignedChat = null;
      if (operator.isActive) {
        try {
          const { queueService } = await import('../services/queue-service.js');
          const result = await queueService.assignNextInQueue(operator.id, []);
          if (result.assigned) {
            console.log('✅ Auto-assigned chat from queue on login:', result.sessionId);
            assignedChat = {
              sessionId: result.sessionId,
              waitTime: result.waitTime
            };
          }
        } catch (error) {
          console.error('⚠️ Failed to auto-assign from queue on login:', error);
        }
      }

      res.json({
        success: true,
        token,
        operator: {
          id: operator.id,
          username: operator.username,
          name: operator.name,
          avatar: '👤',
          email: operator.email,
          isOnline: true,
          isActive: true
        },
        message: 'Login successful',
        autoAssigned: assignedChat // Chat auto-assigned from queue
      });

    } else {
      res.status(401).json({ 
        success: false,
        message: 'Credenziali non valide' 
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

// Get pending chats (sessions that need operator attention)
router.get('/pending-chats', async (req, res) => {
  try {
    const pendingChats = await getPrisma().chatSession.findMany({
      where: {
        status: 'WITH_OPERATOR',
        operatorChats: {
          some: {
            endedAt: null // Has active operator chat but not taken yet
          }
        }
      },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 5
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

    res.json({
      pending: pendingChats.map(chat => ({
        sessionId: chat.sessionId,
        startedAt: chat.startedAt,
        lastActivity: chat.lastActivity,
        lastMessage: chat.messages[0]?.message,
        operatorRequested: true,
        assignedOperator: chat.operatorChats[0]?.operator,
        timeWaiting: Date.now() - new Date(chat.lastActivity).getTime(),
        userLastSeen: chat.lastActivity
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
    const sessionExists = await getPrisma().chatSession.findUnique({
      where: { sessionId }
    });

    if (!sessionExists) {
      console.error('❌ Session not found:', sessionId);
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check if chat already taken by ANOTHER operator
    const existing = await getPrisma().operatorChat.findFirst({
      where: {
        sessionId,
        endedAt: null
      },
      include: {
        operator: {
          select: { id: true, name: true }
        }
      }
    });

    let operatorChat;
    
    if (existing) {
      // Check if it's the same operator trying to take it
      if (existing.operatorId === operatorId) {
        // Same operator, just activate the existing chat
        operatorChat = existing;
        console.log('✅ Operator taking their own assigned chat');
      } else {
        // Different operator, reject
        return res.status(400).json({ 
          error: `Chat already taken by ${existing.operator.name}` 
        });
      }
    } else {
      // Create new operator chat
      operatorChat = await getPrisma().operatorChat.create({
        data: {
          sessionId,
          operatorId
        }
      });
    }

    // Update session status
    await getPrisma().chatSession.update({
      where: { sessionId },
      data: { status: 'WITH_OPERATOR' }
    });

    // 📊 Create SLA record if not already exists (for manually taken chats)
    if (!existing) {
      try {
        // Calculate dynamic priority based on session age
        const session = await getPrisma().chatSession.findUnique({
          where: { sessionId },
          select: { createdAt: true }
        });

        const sessionAge = Date.now() - new Date(session.createdAt).getTime();
        const minutesWaiting = Math.floor(sessionAge / 60000);

        let slaPriority = 'LOW';
        if (minutesWaiting > 15) {
          slaPriority = 'HIGH';
        } else if (minutesWaiting > 5) {
          slaPriority = 'MEDIUM';
        }

        const { slaService } = await import('../services/sla-service.js');
        await slaService.createSLA(
          sessionId,
          'SESSION',
          slaPriority,
          'OPERATOR_ASSIGNED'
        );
        console.log(`✅ SLA record created when operator took chat (priority: ${slaPriority})`);
      } catch (error) {
        console.error('⚠️ Failed to create SLA:', error);
        // Non-blocking
      }
    }

    // Get operator info
    const operator = await getPrisma().operator.findUnique({
      where: { id: operatorId },
      select: { name: true }
    });

    // Add system message
    await getPrisma().message.create({
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

// Open chat (direct access without taking)
router.get('/chat/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Get session with messages
    const session = await getPrisma().chatSession.findUnique({
      where: { sessionId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' }
        },
        operatorChats: {
          where: { endedAt: null },
          include: {
            operator: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        status: session.status,
        startedAt: session.startedAt,
        lastActivity: session.lastActivity,
        operator: session.operatorChats[0]?.operator || null
      },
      messages: session.messages
    });

  } catch (error) {
    console.error('❌ Get chat error:', error);
    res.status(500).json({ error: 'Failed to get chat' });
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
    const existingOperator = await getPrisma().operator.findUnique({
      where: { id: operatorId },
      select: { id: true, isActive: true }
    });

    if (!existingOperator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    // Update to offline
    await getPrisma().operator.update({
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
    const existingOperator = await getPrisma().operator.findUnique({
      where: { id: operatorId },
      select: { id: true, isActive: true }
    });

    if (!existingOperator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    // Update status
    const updatedOperator = await getPrisma().operator.update({
      where: { id: operatorId },
      data: {
        isOnline,
        lastSeen: new Date()
      },
      select: {
        id: true,
        username: true,
        name: true,
        isActive: true,
        isOnline: true,
        lastSeen: true
      }
    });

    console.log('✅ Status updated successfully:', updatedOperator.name, isOnline ? 'ONLINE' : 'OFFLINE');

    // 📋 If operator went online, try to assign next chat from queue
    let assignedChat = null;
    if (isOnline && updatedOperator.isActive) {
      try {
        const { queueService } = await import('../services/queue-service.js');
        const result = await queueService.assignNextInQueue(operatorId, []);
        if (result.assigned) {
          console.log('✅ Auto-assigned chat from queue:', result.sessionId);
          assignedChat = {
            sessionId: result.sessionId,
            waitTime: result.waitTime
          };

          // Notify operator about auto-assignment
          const { notifyOperators } = await import('../utils/notifications.js');
          notifyOperators({
            event: 'chat_auto_assigned',
            sessionId: result.sessionId,
            title: 'Chat Assegnata Automaticamente',
            message: `Chat dalla coda assegnata: ${result.sessionId}`
          }, operatorId);
        } else {
          console.log('ℹ️ No chats in queue to assign');
        }
      } catch (error) {
        console.error('⚠️ Failed to auto-assign from queue:', error);
        // Non-blocking error
      }
    }

    res.json({
      success: true,
      operator: {
        id: updatedOperator.id,
        name: updatedOperator.name,
        isOnline: updatedOperator.isOnline,
        lastSeen: updatedOperator.lastSeen
      },
      autoAssigned: assignedChat // Include info if chat was auto-assigned
    });

  } catch (error) {
    console.error('❌ Status update error:', error);
    res.status(500).json({ 
      error: 'Failed to update status',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
    const operatorChat = await getPrisma().operatorChat.findFirst({
      where: {
        sessionId,
        operatorId,
        endedAt: null
      },
      include: {
        operator: {
          select: {
            id: true,
            name: true,
            username: true
          }
        }
      }
    });

    if (!operatorChat) {
      return res.status(403).json({ error: 'Operator not assigned to this session' });
    }

    // Check if this is the first operator message (for SLA tracking)
    const previousOperatorMessages = await getPrisma().message.count({
      where: {
        sessionId,
        sender: 'OPERATOR'
      }
    });

    const isFirstResponse = previousOperatorMessages === 0;

    // Save operator message
    const savedMessage = await getPrisma().message.create({
      data: {
        sessionId,
        sender: 'OPERATOR',
        message: sanitizedMessage,
        metadata: {
          operatorId,
          operatorName: operatorChat.operator.name,
          isFirstResponse
        }
      }
    });

    // 📊 Mark first response in SLA if this is the first message
    if (isFirstResponse) {
      try {
        const { slaService } = await import('../services/sla-service.js');
        await slaService.markFirstResponse(sessionId, 'SESSION', operatorId);
        console.log('✅ First response SLA marked for session', sessionId);
      } catch (error) {
        console.error('⚠️ Failed to mark first response SLA:', error);
        // Non-blocking error
      }
    }

    // Update session last activity
    await getPrisma().chatSession.update({
      where: { sessionId },
      data: { lastActivity: new Date() }
    });

    console.log(`✅ Operator message saved to DB for session ${sessionId}: "${sanitizedMessage}"${isFirstResponse ? ' (FIRST RESPONSE)' : ''}`);

    // TODO: Add user notification system here if needed
    // For now, user should receive message via polling on their chat endpoint

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

// Get messages for a session (for polling/real-time updates)
router.get('/messages/:sessionId', authenticateToken, validateSession, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24h default
    
    // Verify operator has access to this session
    const operatorChat = await getPrisma().operatorChat.findFirst({
      where: {
        sessionId,
        operatorId: req.operator.id,
        endedAt: null
      }
    });
    
    if (!operatorChat) {
      return res.status(403).json({ error: 'Access denied to this session' });
    }
    
    // Get messages since timestamp
    const messages = await getPrisma().message.findMany({
      where: {
        sessionId,
        timestamp: { gte: since }
      },
      orderBy: { timestamp: 'asc' },
      take: 100 // Limit to prevent overload
    });
    
    res.success({
      messages,
      sessionId,
      count: messages.length
    });
    
  } catch (error) {
    console.error('❌ Get messages error:', error);
    res.error('Failed to fetch messages', 'MESSAGES_FETCH_ERROR');
  }
});

export default router;