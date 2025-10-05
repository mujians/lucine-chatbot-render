import express from 'express';
import container from '../config/container.js';
import {
  authenticateToken,
  validateSession,
  TokenManager,
  loginLimiter
} from '../middleware/security.js';
import { getAutomatedText } from '../utils/automated-texts.js';
import { operatorEventLogger } from '../services/operator-event-logging.js';
import {
  createSystemMessage,
  createOperatorMessage,
  MESSAGE_CONTEXTS
} from '../utils/message-types.js';
import { authService } from '../services/auth-service.js';
import { OperatorRepository } from '../utils/operator-repository.js';
import { calculatePriority } from '../utils/priority-calculator.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Helper to get database client (lazy load)
const getDatabase = () => container.get('prisma');




// ✅ Operator login (refactored to use AuthService)
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Delegate authentication to AuthService
    const result = await authService.login(username, password, {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    });

    // Handle authentication result
    if (!result.success) {
      return res.status(result.statusCode || 401).json({
        success: false,
        message: result.message
      });
    }

    // Success response
    res.json({
      success: true,
      token: result.token,
      operator: result.operator,
      message: result.message,
      autoAssigned: result.autoAssigned
    });

  } catch (error) {
    logger.auth.error('login', error);
    res.status(500).json({
      success: false,
      message: 'Errore del server durante il login',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

// ✅ Get list of operators (using OperatorRepository)
router.get('/list', async (req, res) => {
  try {
    const operators = await OperatorRepository.getActiveOperators();
    res.json(operators);
  } catch (error) {
    logger.error('OPERATORS', 'Failed to fetch operators list', error);
    res.status(500).json({ error: 'Failed to fetch operators' });
  }
});

// 📊 Dashboard Summary - Single endpoint for all dashboard data
router.get('/dashboard-summary', authenticateToken, async (req, res) => {
  try {
    // Fetch everything in parallel
    const [pendingChatsData, ticketsData, chatHistoryCount] = await Promise.all([
      // Pending chats count
      (async () => {
        const waiting = await getDatabase().chatSession.count({
          where: { status: 'WAITING_OPERATOR' }
        });
        const active = await getDatabase().chatSession.count({
          where: {
            status: 'WITH_OPERATOR',
            operatorChats: { some: { endedAt: null } }
          }
        });
        return { waiting, active, total: waiting + active };
      })(),

      // Tickets count (active tickets: OPEN, IN_PROGRESS, WAITING_USER)
      getDatabase().ticket.count({
        where: {
          status: {
            in: ['OPEN', 'IN_PROGRESS', 'WAITING_USER']
          }
        }
      }),

      // Total sessions
      getDatabase().chatSession.count()
    ]);

    res.json({
      badges: {
        pendingChats: pendingChatsData.total,
        waitingChats: pendingChatsData.waiting,
        activeChats: pendingChatsData.active,
        openTickets: ticketsData,
        totalSessions: chatHistoryCount
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('OPERATORS', 'Dashboard summary error', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

// Get pending chats (sessions that need operator attention) AND active operator chats
router.get('/pending-chats', authenticateToken, async (req, res) => {
  try {
    // 1. Fetch sessions WAITING_OPERATOR (in queue)
    const waitingChats = await getDatabase().chatSession.findMany({
      where: {
        status: 'WAITING_OPERATOR'
      },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 5
        },
        queueEntries: {
          where: { status: 'WAITING' },
          select: { priority: true, enteredAt: true }
        }
      },
      orderBy: { lastActivity: 'desc' }
    });

    // 2. Fetch sessions WITH_OPERATOR (assigned and active)
    const activeChats = await getDatabase().chatSession.findMany({
      where: {
        status: 'WITH_OPERATOR',
        operatorChats: {
          some: {
            endedAt: null // Has active operator chat
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

    // Enrich waiting chats with queue data
    const { queueService } = await import('../services/queue-service.js');
    const waitingChatsWithQueue = await Promise.all(waitingChats.map(async (chat) => {
      const queueEntry = chat.queueEntries[0];
      let queuePosition = null;
      let estimatedWait = null;

      if (queueEntry) {
        queuePosition = await queueService.getQueuePosition(chat.sessionId);
        estimatedWait = await queueService.calculateEstimatedWait(queueEntry.priority);
      }

      return {
        sessionId: chat.sessionId,
        startedAt: chat.startedAt,
        lastActivity: chat.lastActivity,
        lastMessage: chat.messages[0]?.message,
        status: 'waiting',
        priority: queueEntry?.priority || 'MEDIUM',
        queuePosition,
        estimatedWait,
        timeWaiting: Date.now() - new Date(chat.lastActivity).getTime(),
        userLastSeen: chat.lastActivity,
        enteredQueueAt: queueEntry?.enteredAt
      };
    }));

    res.json({
      // Waiting chats (in queue, not yet assigned)
      waiting: waitingChatsWithQueue,
      // Active chats (assigned to operators)
      active: activeChats.map(chat => ({
        sessionId: chat.sessionId,
        startedAt: chat.startedAt,
        lastActivity: chat.lastActivity,
        lastMessage: chat.messages[0]?.message,
        status: 'active',
        assignedOperator: chat.operatorChats[0]?.operator,
        operatorChatId: chat.operatorChats[0]?.id,
        timeWaiting: Date.now() - new Date(chat.lastActivity).getTime(),
        userLastSeen: chat.lastActivity
      })),
      // Legacy: "pending" for backwards compatibility (waiting chats only)
      pending: waitingChats.map(chat => ({
        sessionId: chat.sessionId,
        startedAt: chat.startedAt,
        lastActivity: chat.lastActivity,
        lastMessage: chat.messages[0]?.message,
        operatorRequested: true,
        timeWaiting: Date.now() - new Date(chat.lastActivity).getTime(),
        userLastSeen: chat.lastActivity
      })),
      count: waitingChats.length + activeChats.length,
      waitingCount: waitingChats.length,
      activeCount: activeChats.length
    });

  } catch (error) {
    logger.error('OPERATORS', 'Failed to fetch chats', error);
    res.status(500).json({ error: 'Failed to fetch pending chats' });
  }
});

// Get chat history with filters
router.get('/chat-history', authenticateToken, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    // Build filter
    const where = {};
    if (status) {
      where.status = status;
    }

    const sessions = await getDatabase().chatSession.findMany({
      where,
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1 // Just last message for preview
        },
        operatorChats: {
          include: {
            operator: {
              select: { id: true, name: true }
            }
          },
          orderBy: { startedAt: 'desc' }
        }
      },
      orderBy: { lastActivity: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset)
    });

    // Count total for pagination
    const total = await getDatabase().chatSession.count({ where });

    res.json({
      sessions: sessions.map(session => ({
        sessionId: session.sessionId,
        status: session.status,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        lastActivity: session.lastActivity,
        lastMessage: session.messages[0]?.message || 'Nessun messaggio',
        messageCount: session.messages.length,
        operators: session.operatorChats.map(oc => oc.operator),
        hasOperator: session.operatorChats.length > 0
      })),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (parseInt(offset) + parseInt(limit)) < total
    });

  } catch (error) {
    logger.error('OPERATORS', 'Failed to fetch chat history', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Take chat
router.post('/take-chat', authenticateToken, validateSession, async (req, res) => {
  try {
    const { sessionId, operatorId } = req.body;

    // Verifica che la sessione esista
    const sessionExists = await getDatabase().chatSession.findUnique({
      where: { sessionId }
    });

    if (!sessionExists) {
      logger.warn('OPERATORS', 'Session not found', { sessionId });
      return res.status(404).json({ error: 'Session not found' });
    }

    // Check if chat already taken by ANOTHER operator
    const existing = await getDatabase().operatorChat.findFirst({
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
        // Same operator - IDEMPOTENT: Already taken, just return success
        logger.info('OPERATORS', 'Chat already taken by this operator (idempotent)', { sessionId, operatorId });
        return res.json({
          success: true,
          chatId: existing.id,
          operator: existing.operator.name,
          alreadyTaken: true
        });
      } else {
        // Different operator, reject
        return res.status(400).json({
          error: `Chat already taken by ${existing.operator.name}`
        });
      }
    }

    // Create new operator chat (only if not existing)
    operatorChat = await getDatabase().operatorChat.create({
      data: {
        sessionId,
        operatorId
      }
    });

    // Update session status
    await getDatabase().chatSession.update({
      where: { sessionId },
      data: { status: 'WITH_OPERATOR' }
    });

    // Log operator taking chat
    const queueEntry = await getDatabase().queueEntry.findFirst({
      where: { sessionId, status: 'WAITING' }
    });
    const queueWaitTime = queueEntry
      ? Date.now() - new Date(queueEntry.enteredAt).getTime()
      : 0;

    await operatorEventLogger.logChatTaken(operatorId, sessionId, queueWaitTime);

    // 📋 Remove from queue if present (mark as ASSIGNED)
    try {
      const { queueService } = await import('../services/queue-service.js');
      const queueEntry = await getDatabase().queueEntry.findFirst({
        where: {
          sessionId,
          status: 'WAITING'
        }
      });

      if (queueEntry) {
        await getDatabase().queueEntry.update({
          where: { id: queueEntry.id },
          data: {
            status: 'ASSIGNED',
            assignedTo: operatorId,
            assignedAt: new Date()
          }
        });
        logger.queue.assigned(sessionId, operatorId, { queueId: queueEntry.id });

        // Update queue positions for remaining entries
        await queueService.updateQueuePositions();
      }
    } catch (error) {
      logger.warn('QUEUE', 'Failed to update queue entry', { sessionId, error: error.message });
      // Non-blocking
    }

    // 📊 Create SLA record if not already exists (for manually taken chats)
    if (!existing) {
      try {
        // Calculate dynamic priority based on session age (centralized logic)
        const session = await getDatabase().chatSession.findUnique({
          where: { sessionId },
          select: { createdAt: true }
        });

        // ✅ Use centralized priority calculator
        const slaPriority = calculatePriority(session.createdAt);

        const { slaService } = await import('../services/sla-service.js');
        await slaService.createSLA(
          sessionId,
          'SESSION',
          slaPriority,
          'OPERATOR_ASSIGNED'
        );
        logger.sla.created(sessionId, slaPriority, 'OPERATOR_ASSIGNED');
      } catch (error) {
        logger.warn('SLA', 'Failed to create SLA', { sessionId, error: error.message });
        // Non-blocking
      }
    }

    // Get operator info
    const operator = await getDatabase().operator.findUnique({
      where: { id: operatorId },
      select: { name: true }
    });

    // Add system message FIRST (only if new operator chat)
    if (!existing) {
      const systemMessage = await createSystemMessage(
        getDatabase(),
        sessionId,
        `👤 ${operator.name} si è unito alla chat`,
        MESSAGE_CONTEXTS.OPERATOR_JOINED,
        { operatorId, operatorName: operator.name }
      );

      // Send system message via WebSocket for instant delivery
      try {
        const { notifyWidget } = await import('../utils/notifications.js');
        notifyWidget(sessionId, {
          event: 'system_message',
          message: {
            id: systemMessage.id,
            sender: 'SYSTEM',
            message: systemMessage.message,
            timestamp: systemMessage.timestamp,
            metadata: systemMessage.metadata
          }
        });
        logger.websocket.sent(sessionId, 'system_message');
      } catch (wsError) {
        logger.warn('WEBSOCKET', 'Failed to send system message', { sessionId, error: wsError.message });
      }
    }

    // Check if automatic greeting was already sent (to avoid duplicates)
    // Look specifically for automatic OPERATOR message with isAutomatic flag
    const existingGreeting = await getDatabase().message.findFirst({
      where: {
        sessionId,
        sender: 'OPERATOR',
        metadata: {
          path: ['isAutomatic'],
          equals: true
        }
      },
      orderBy: { timestamp: 'asc' }
    });

    // Send automatic greeting AFTER system message (for correct order)
    if (!existingGreeting) {
      logger.debug('OPERATORS', 'Sending operator greeting', { sessionId, operatorName: operator.name });
      const greetingText = await getAutomatedText('operator_greeting');

      const greetingMessage = await createOperatorMessage(
        getDatabase(),
        sessionId,
        greetingText,
        operatorId,
        true, // isAutomatic
        MESSAGE_CONTEXTS.OPERATOR_GREETING
      );

      // Send greeting to widget via WebSocket
      try {
        const { notifyWidget } = await import('../utils/notifications.js');
        notifyWidget(sessionId, {
          event: 'new_operator_message',
          message: {
            id: greetingMessage.id,
            sender: 'OPERATOR',
            message: greetingMessage.message,
            timestamp: greetingMessage.timestamp,
            operatorId,
            isAutomatic: true,
            metadata: greetingMessage.metadata
          }
        });
        logger.websocket.sent(sessionId, 'operator_greeting');
      } catch (wsError) {
        logger.debug('WEBSOCKET', 'Greeting will arrive via polling', { sessionId });
      }
    } else {
      logger.debug('OPERATORS', 'Greeting already sent, skipping', { sessionId });
    }

    res.json({
      success: true,
      chatId: operatorChat.id,
      operator: operator.name
    });

  } catch (error) {
    logger.error('OPERATORS', 'Take-chat error', {
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
    const session = await getDatabase().chatSession.findUnique({
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
    logger.error('OPERATORS', 'Get chat error', error);
    res.status(500).json({ error: 'Failed to get chat' });
  }
});


// ✅ Operator logout (refactored to use AuthService)
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { operatorId } = req.body;

    logger.auth.logout(operatorId);

    // Validation
    if (!operatorId) {
      return res.status(400).json({ error: 'OperatorId is required' });
    }

    // Delegate to AuthService
    await authService.logout(operatorId);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    logger.error('AUTH', 'Logout error', error);
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

    logger.debug('OPERATORS', 'Status update request', { operatorId, isOnline, requestBy: req.operator?.id });

    // Validation
    if (!operatorId) {
      return res.status(400).json({ error: 'OperatorId is required' });
    }

    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({ error: 'isOnline must be boolean' });
    }

    // Security check: ensure authenticated operator matches
    if (req.operator && req.operator.id !== operatorId) {
      logger.warn('OPERATORS', 'Unauthorized status update attempt', { requestBy: req.operator.id, targetOperator: operatorId });
      return res.status(403).json({
        error: 'You can only update your own status',
        details: { authenticated: req.operator.id, requested: operatorId }
      });
    }

    // Check if operator exists
    const existingOperator = await getDatabase().operator.findUnique({
      where: { id: operatorId },
      select: { id: true, isActive: true }
    });

    if (!existingOperator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    // Update status
    const updatedOperator = await getDatabase().operator.update({
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

    logger.info('OPERATORS', 'Status updated successfully', { operator: updatedOperator.name, isOnline });

    // 📋 If operator went online, try to assign next chat from queue
    let assignedChat = null;
    if (isOnline && updatedOperator.isActive) {
      try {
        const { queueService } = await import('../services/queue-service.js');
        const result = await queueService.assignNextInQueue(operatorId, []);
        if (result.assigned) {
          logger.queue.assigned(result.sessionId, operatorId, { auto: true });
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
          logger.debug('QUEUE', 'No chats in queue to assign', { operatorId });
        }
      } catch (error) {
        logger.warn('QUEUE', 'Failed to auto-assign from queue', { operatorId, error: error.message });
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
    logger.error('OPERATORS', 'Status update error', error);
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
    
    logger.chat.operatorMessage(sessionId, operatorId, message?.length || 0);
    
    if (!sessionId || !operatorId || !message) {
      return res.status(400).json({ error: 'SessionId, operatorId and message required' });
    }

    // Sanitize message
    const sanitizedMessage = message.trim();
    if (sanitizedMessage.length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // Verify operator is assigned to this session
    const operatorChat = await getDatabase().operatorChat.findFirst({
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
    const previousOperatorMessages = await getDatabase().message.count({
      where: {
        sessionId,
        sender: 'OPERATOR'
      }
    });

    const isFirstResponse = previousOperatorMessages === 0;

    // Save operator message
    const savedMessage = await getDatabase().message.create({
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
        logger.sla.firstResponse(sessionId);
      } catch (error) {
        logger.warn('SLA', 'Failed to mark first response', { sessionId, error: error.message });
        // Non-blocking error
      }
    }

    // Update session last activity
    await getDatabase().chatSession.update({
      where: { sessionId },
      data: { lastActivity: new Date() }
    });

    logger.debug('OPERATORS', 'Message saved to DB', { sessionId, messageLength: sanitizedMessage.length, isFirstResponse });

    // 📱 Send message to widget via WebSocket (real-time delivery)
    try {
      const { notifyWidget } = await import('../utils/notifications.js');
      const sent = notifyWidget(sessionId, {
        event: 'new_operator_message',
        message: {
          id: savedMessage.id,
          sender: 'OPERATOR',
          message: sanitizedMessage,
          timestamp: savedMessage.timestamp,
          // Don't send operatorName - widget shows message directly without prefix
          operatorId: operatorChat.operator.id,
          isFirstResponse
        }
      });

      if (sent) {
        logger.websocket.sent(sessionId, 'operator_message');
      } else {
        logger.debug('WEBSOCKET', 'Widget not connected, will receive via polling', { sessionId });
      }
    } catch (error) {
      logger.warn('WEBSOCKET', 'Failed to notify widget', { sessionId, error: error.message });
      // Non-blocking - user will get message via polling fallback
    }

    // 📊 Record analytics for operator message
    try {
      await getDatabase().analytics.create({
        data: {
          eventType: 'operator_message_sent',
          sessionId,
          eventData: {
            operatorId,
            operatorName: operatorChat.operator.name,
            messageLength: sanitizedMessage.length,
            isFirstResponse
          },
          successful: true
        }
      });
    } catch (error) {
      logger.warn('ANALYTICS', 'Failed to log message analytics', { sessionId, error: error.message });
    }

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
    logger.error('OPERATORS', 'Send operator message error', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * 🔚 POST /operators/close-conversation
 * Operator initiates conversation closure - sends message to user asking if they need more help
 */
router.post('/close-conversation', authenticateToken, async (req, res) => {
  try {
    const { sessionId, operatorId } = req.body;

    if (!sessionId || !operatorId) {
      return res.status(400).json({ error: 'SessionId and operatorId required' });
    }

    logger.chat.close(sessionId, operatorId);

    // Verify session exists and is with operator
    const session = await getDatabase().chatSession.findUnique({
      where: { sessionId },
      include: {
        operatorChats: {
          where: { endedAt: null }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'WITH_OPERATOR') {
      return res.status(400).json({ error: 'Session is not with an operator' });
    }

    // Allow closure even if operatorChat was ended (user clicked continue after first closure)
    // Just check if there's an operator chat record (ended or not)
    const hasOperatorChat = await getDatabase().operatorChat.findFirst({
      where: {
        sessionId,
        operatorId
      }
    });

    if (!hasOperatorChat) {
      return res.status(400).json({ error: 'No operator chat found for this session' });
    }

    // Send closure question to user via widget with smart actions
    const closureText = await getAutomatedText('closure_request');

    const smartActions = [
      {
        type: 'success',
        icon: '💬',
        text: 'Continua la chat',
        description: 'Ho ancora bisogno di aiuto',
        action: 'continue_chat'
      },
      {
        type: 'secondary',
        icon: '✅',
        text: 'Chiudi pure',
        description: 'Tutto risolto, grazie!',
        action: 'end_chat'
      }
    ];

    // Save message to database with smartActions in metadata for polling fallback
    const closureMessage = await getDatabase().message.create({
      data: {
        sessionId,
        sender: 'SYSTEM',
        message: closureText,
        metadata: {
          smartActions,
          isClosureRequest: true
        }
      }
    });

    // Also send via WebSocket for instant delivery
    const { notifyWidget } = await import('../utils/notifications.js');
    const sent = notifyWidget(sessionId, {
      event: 'closure_request',
      message: {
        id: closureMessage.id,
        sender: 'SYSTEM',
        message: closureText,
        timestamp: closureMessage.timestamp,
        smartActions
      }
    });

    if (!sent) {
      logger.debug('WEBSOCKET', 'Widget not connected, closure request will arrive via polling', { sessionId });
    } else {
      logger.websocket.sent(sessionId, 'closure_request');
    }

    res.json({
      success: true,
      message: 'Closure request sent to user'
    });

  } catch (error) {
    logger.error('OPERATORS', 'Close conversation error', error);
    res.status(500).json({ error: 'Failed to initiate conversation closure' });
  }
});

// Get messages for a session (for polling/real-time updates)
router.get('/messages/:sessionId', authenticateToken, validateSession, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24h default
    
    // Verify operator has access to this session
    const operatorChat = await getDatabase().operatorChat.findFirst({
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
    const messages = await getDatabase().message.findMany({
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
    logger.error('OPERATORS', 'Get messages error', error);
    res.error('Failed to fetch messages', 'MESSAGES_FETCH_ERROR');
  }
});

export default router;