/**
 * 💬 CHAT ROUTER - MODULAR VERSION
 * Main router che orchestra tutti gli handler
 */

import express from 'express';
import container from '../../config/container.js';
import { timeoutService } from '../../services/timeout-service.js';
import { SESSION_STATUS } from '../../config/constants.js';
import {
  generateSecureSessionId,
  isValidSessionId,
  validateChatMessage,
  chatRateLimiter
} from '../../utils/security.js';
import { authenticateToken } from '../../middleware/security.js';
import { ValidationError } from '../../utils/error-handler.js';

// Handlers
import { handleTicketCollection } from './ticket-handler.js';
import { handleAIResponse } from './ai-handler.js';
import { handleEscalation } from './escalation-handler.js';
import {
  getOrCreateSession,
  saveUserMessage,
  buildConversationHistory,
  isWithOperator,
  isRequestingTicket
} from './session-handler.js';
import { handlePolling } from './polling-handler.js';
import { resumeChatFromToken } from './resume-handler.js';
import { getAutomatedText } from '../../utils/automated-texts.js';

const router = express.Router();

/**
 * 📨 Main chat endpoint
 */
router.post('/', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    console.log('📨 NEW CHAT REQUEST:', {
      message: typeof message === 'string' ? message.substring(0, 50) : message,
      sessionId,
      timestamp: new Date().toISOString()
    });

    // Rate limiting
    const clientId = sessionId || req.ip;
    if (chatRateLimiter.isRateLimited(clientId)) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Troppi messaggi, riprova tra qualche secondo'
      });
    }

    // Validate and sanitize message
    const validation = validateChatMessage(message);
    if (!validation.valid) {
      throw new ValidationError(validation.errors.join(', '), 'message');
    }

    const sanitizedMessage = validation.sanitized;

    // Validate or generate sessionId (server-side)
    let finalSessionId;
    if (sessionId) {
      if (!isValidSessionId(sessionId)) {
        throw new ValidationError('Invalid session ID format', 'sessionId');
      }
      finalSessionId = sessionId;
    } else {
      // Generate secure session ID server-side
      finalSessionId = generateSecureSessionId();
      console.log('🔐 Generated new secure session ID');
    }

    // Get or create session
    const session = await getOrCreateSession(finalSessionId, {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Save user message (sanitized) and update session activity
    await saveUserMessage(session.sessionId, sanitizedMessage);

    // Check if session is in timeout - riattiva se necessario
    if (session.status === SESSION_STATUS.WAITING_CLIENT) {
      const reactivated = await timeoutService.reactivateChat(session.sessionId);
      if (reactivated) {
        console.log(`🔄 Chat ${session.sessionId} riattivata da WAITING_CLIENT`);
        // Aggiorna session object per continuare il flusso
        session.status = session.operatorChats.length > 0 ?
          SESSION_STATUS.WITH_OPERATOR : SESSION_STATUS.ACTIVE;
      }
    }

    // Check if in live chat with operator
    if (isWithOperator(session)) {
      // 📨 Notify operator about new user message (real-time)
      const activeOperatorChat = session.operatorChats.find(chat => !chat.endedAt);
      if (activeOperatorChat) {
        const { notifyOperators } = await import('../../utils/notifications.js');
        notifyOperators({
          event: 'new_message',
          sessionId: session.sessionId,
          message: sanitizedMessage,
          sender: 'USER',
          timestamp: new Date().toISOString(),
          title: 'Nuovo messaggio utente',
          operatorChatId: activeOperatorChat.id
        }, activeOperatorChat.operatorId); // Notify only assigned operator

        console.log(`📨 Notified operator ${activeOperatorChat.operatorId} of new user message`);
      }

      // Don't send confirmation - widget already shows message
      return res.json({
        reply: null, // No bot reply when with operator
        sessionId: session.sessionId,
        status: 'with_operator',
        operatorConnected: true
      });
    }

    // Check if user is responding to conversation closure request
    if (sanitizedMessage === 'continue_chat') {
      console.log('✅ User wants to continue chat with operator');

      const continueText = await getAutomatedText('chat_continue');

      return res.json({
        reply: continueText,
        sessionId: session.sessionId,
        status: 'with_operator',
        operatorConnected: true
      });
    }

    if (sanitizedMessage === 'end_chat') {
      console.log('👋 User confirmed conversation end');

      const prisma = container.get('prisma');

      // End operator chat
      await prisma.operatorChat.updateMany({
        where: {
          sessionId: session.sessionId,
          endedAt: null
        },
        data: {
          endedAt: new Date()
        }
      });

      // Set session back to ACTIVE (AI takes over)
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { status: SESSION_STATUS.ACTIVE }
      });

      console.log(`✅ Chat ${session.sessionId} returned to AI control`);

      const endGoodbyeText = await getAutomatedText('chat_end_goodbye');

      return res.json({
        reply: endGoodbyeText,
        sessionId: session.sessionId,
        status: 'back_to_ai',
        operatorConnected: false
      });
    }

    // Check if user is in ticket collection workflow
    if (isRequestingTicket(session)) {
      return await handleTicketCollection(sanitizedMessage, session, res);
    }

    // Check if user is requesting a ticket (trigger words)
    const ticketTriggers = /apri.*ticket|crea.*ticket|voglio.*ticket|ticket|request_ticket/i;
    if (ticketTriggers.test(sanitizedMessage)) {
      console.log('🎫 Ticket request detected, starting collection flow');

      const prisma = container.get('prisma');

      // Check if already has a recent open ticket for this session
      const existingTicket = await prisma.ticket.findFirst({
        where: {
          sessionId: session.sessionId,
          status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_USER'] }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (existingTicket) {
        const alreadyExistsText = await getAutomatedText('ticket_already_exists', {
          ticketNumber: existingTicket.ticketNumber
        });

        return res.json({
          reply: alreadyExistsText,
          sessionId: session.sessionId,
          status: 'ticket_exists',
          ticketNumber: existingTicket.ticketNumber
        });
      }

      // Set session to REQUESTING_TICKET
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { status: SESSION_STATUS.REQUESTING_TICKET }
      });

      // Return message asking for name (first step)
      const ticketStartText = await getAutomatedText('ticket_start');

      return res.json({
        reply: ticketStartText,
        sessionId: session.sessionId,
        status: 'requesting_ticket',
        smartActions: []
      });
    }

    // Build conversation history
    const history = buildConversationHistory(session.messages);

    // Get AI response (usa messaggio sanitized)
    const aiResponse = await handleAIResponse(sanitizedMessage, session, history);

    // Handle escalation if requested
    if (aiResponse.escalation === 'operator') {
      const escalationResult = await handleEscalation(message, session);
      return res.json(escalationResult);
    }

    // Return AI response
    return res.json({
      reply: aiResponse.reply,
      sessionId: session.sessionId,
      status: 'active',
      actions: aiResponse.actions,
      smartActions: aiResponse.smartActions
    });

  } catch (error) {
    console.error('❌ Chat endpoint error:', error);
    return res.status(500).json({
      error: 'Errore nel processare il messaggio',
      message: error.message
    });
  }
});

/**
 * 📡 Polling endpoint for operator messages
 */
router.get('/poll/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await handlePolling(sessionId);
    return res.json(result);
  } catch (error) {
    console.error('❌ Polling endpoint error:', error);
    return res.status(500).json({
      error: 'Errore nel polling messaggi',
      message: error.message
    });
  }
});

/**
 * 🔗 Resume chat from ticket token
 */
router.get('/resume/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const result = await resumeChatFromToken(token);

    if (result.error) {
      return res.status(404).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('❌ Resume chat error:', error);
    return res.status(500).json({
      error: 'Errore nel riprendere la conversazione',
      message: error.message
    });
  }
});

/**
 * 📋 Get session details with messages (operators only)
 */
router.get('/sessions/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const prisma = container.get('prisma');

    const session = await prisma.chatSession.findUnique({
      where: { sessionId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' }
        },
        operatorChats: {
          include: {
            operator: {
              select: { name: true, displayName: true }
            }
          }
        }
      }
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get operator name if available
    const activeOperatorChat = session.operatorChats.find(chat => !chat.endedAt);
    const operatorName = activeOperatorChat ?
      (activeOperatorChat.operator.displayName || activeOperatorChat.operator.name) : null;

    return res.json({
      sessionId: session.sessionId,
      status: session.status,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
      lastActivity: session.lastActivity,
      operatorName,
      messages: session.messages.map(msg => ({
        id: msg.id,
        sender: msg.sender,
        message: msg.message,
        timestamp: msg.timestamp
      }))
    });

  } catch (error) {
    console.error('❌ Get session error:', error);
    return res.status(500).json({
      error: 'Errore nel recuperare la sessione',
      message: error.message
    });
  }
});

export default router;
