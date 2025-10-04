import express from 'express';
import container from '../config/container.js';
import { StatusCodes, ErrorCodes } from '../utils/api-response.js';

const router = express.Router();

// Helper to get prisma (lazy load)
const getPrisma = () => container.get('prisma');
// const prisma = container.get('prisma');

// Create ticket
router.post('/', async (req, res) => {
  try {
    const { 
      sessionId, 
      subject, 
      description, 
      userEmail, 
      userPhone, 
      contactMethod 
    } = req.body;

    // Validazione input
    if (!description && !subject) {
      return res.validationError(['Richiedo almeno subject o description']);
    }

    if (!userEmail && !userPhone) {
      return res.validationError(['Richiedo almeno email o telefono per il contatto']);
    }

    console.log('🎫 Creating ticket with data:', {
      sessionId,
      subject: subject || 'Richiesta supporto',
      description: description || subject || 'Richiesta di supporto dal chatbot',
      userEmail,
      userPhone,
      contactMethod: contactMethod || 'EMAIL',
      priority: 'MEDIUM'
    });

    const ticket = await getPrisma().ticket.create({
      data: {
        sessionId,
        subject: subject || 'Richiesta supporto',
        description: description || subject || 'Richiesta di supporto dal chatbot',
        userEmail,
        userPhone,
        contactMethod: contactMethod || 'EMAIL',
        priority: 'MEDIUM',
        status: 'OPEN' // Aggiungiamo esplicitamente lo status
      }
    });

    // Log analytics
    await getPrisma().analytics.create({
      data: {
        eventType: 'ticket_created',
        sessionId,
        eventData: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          contactMethod
        }
      }
    });

    res.success({
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber
    }, `Ticket #${ticket.ticketNumber} creato. Ti contatteremo presto!`);

  } catch (error) {
    console.error('❌ Ticket creation error:', {
      message: error.message,
      code: error.code,
      meta: error.meta
    });
    
    // Controllo errori specifici
    if (error.code === 'P2002') {
      return res.error(
        'Ticket già esistente per questa sessione',
        ErrorCodes.DUPLICATE_RESOURCE,
        StatusCodes.CONFLICT
      );
    }
    
    if (error.code === 'P2003') {
      return res.error(
        'SessionId non valido o non esistente',
        ErrorCodes.NOT_FOUND,
        StatusCodes.BAD_REQUEST
      );
    }
    
    res.error(
      'Failed to create ticket',
      ErrorCodes.INTERNAL_ERROR,
      StatusCodes.INTERNAL_SERVER_ERROR
    );
  }
});

// Riapri chat da ticket
router.post('/:ticketNumber/reopen-chat', async (req, res) => {
  try {
    const { ticketNumber } = req.params;
    const { operatorId } = req.body;

    // Trova ticket
    const ticket = await getPrisma().ticket.findUnique({
      where: { ticketNumber },
      include: { session: true }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (!ticket.sessionId) {
      return res.status(400).json({ error: 'Ticket non collegato a una sessione chat' });
    }

    // Verifica che operatore esista
    const operator = await getPrisma().operator.findUnique({
      where: { id: operatorId, isActive: true }
    });

    if (!operator) {
      return res.status(404).json({ error: 'Operator not found' });
    }

    // Riattiva sessione se terminata
    if (ticket.session.status === 'ENDED') {
      await getPrisma().chatSession.update({
        where: { sessionId: ticket.sessionId },
        data: { 
          status: 'WITH_OPERATOR',
          lastActivity: new Date()
        }
      });
    }

    // Crea nuovo OperatorChat se non esiste
    const existingChat = await getPrisma().operatorChat.findFirst({
      where: {
        sessionId: ticket.sessionId,
        endedAt: null
      }
    });

    let operatorChat;
    if (!existingChat) {
      operatorChat = await getPrisma().operatorChat.create({
        data: {
          sessionId: ticket.sessionId,
          operatorId
        }
      });
    } else {
      operatorChat = existingChat;
    }

    // Aggiorna ticket status
    await getPrisma().ticket.update({
      where: { id: ticket.id },
      data: { 
        status: 'IN_PROGRESS',
        operatorId: operatorId
      }
    });

    // Messaggio di sistema per riapertura
    await getPrisma().message.create({
      data: {
        sessionId: ticket.sessionId,
        sender: 'SYSTEM',
        message: `🔄 Chat riaperta da ticket #${ticketNumber}\n👤 ${operator.name} è ora disponibile per assisterti`
      }
    });

    // Notifica operatore via WebSocket
    if (global.operatorConnections && global.operatorConnections.has(operatorId)) {
      const ws = global.operatorConnections.get(operatorId);
      ws.send(JSON.stringify({
        type: 'chat_reopened',
        sessionId: ticket.sessionId,
        ticketNumber: ticket.ticketNumber,
        timestamp: new Date().toISOString()
      }));
    }

    res.json({
      success: true,
      sessionId: ticket.sessionId,
      operatorChatId: operatorChat.id,
      message: 'Chat riaperta con successo',
      chatUrl: `/operators/chat/${ticket.sessionId}`
    });

  } catch (error) {
    console.error('❌ Reopen chat error:', error);
    res.status(500).json({ error: 'Failed to reopen chat from ticket' });
  }
});

// Get ticket status
router.get('/:ticketNumber', async (req, res) => {
  try {
    const ticket = await getPrisma().ticket.findUnique({
      where: { ticketNumber: req.params.ticketNumber },
      include: {
        notes: {
          where: { isPublic: true },
          orderBy: { createdAt: 'desc' }
        },
        assignedTo: {
          select: { name: true }
        }
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json({
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      assignedTo: ticket.assignedTo?.name,
      notes: ticket.notes
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ticket' });
  }
});

// List all tickets (admin)
router.get('/', async (req, res) => {
  try {
    // TODO: Add authentication check
    
    const tickets = await getPrisma().ticket.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: {
          select: { name: true }
        }
      }
    });

    res.json({
      tickets,
      count: tickets.length,
      stats: {
        open: tickets.filter(t => t.status === 'OPEN').length,
        inProgress: tickets.filter(t => t.status === 'IN_PROGRESS').length,
        waitingUser: tickets.filter(t => t.status === 'WAITING_USER').length,
        resolved: tickets.filter(t => t.status === 'RESOLVED').length,
        closed: tickets.filter(t => t.status === 'CLOSED').length,
        // Active tickets (not resolved/closed)
        active: tickets.filter(t => !['RESOLVED', 'CLOSED'].includes(t.status)).length
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Update ticket (admin)
router.put('/:ticketId', async (req, res) => {
  try {
    // TODO: Add authentication check
    
    const { status, priority, operatorId, note } = req.body;
    
    const ticket = await getPrisma().ticket.update({
      where: { id: req.params.ticketId },
      data: {
        status,
        priority,
        operatorId,
        resolvedAt: status === 'RESOLVED' ? new Date() : undefined
      }
    });

    if (note) {
      await getPrisma().ticketNote.create({
        data: {
          ticketId: ticket.id,
          note,
          createdBy: operatorId,
          isPublic: false
        }
      });
    }

    res.json({ 
      success: true, 
      ticket 
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

// Create ticket from chat interaction (quando operatori offline)
router.post('/from-chat', async (req, res) => {
  try {
    const { sessionId, userInput, contactInfo } = req.body;

    // Validazione base
    if (!sessionId) {
      return res.status(400).json({ error: 'SessionId richiesto' });
    }

    // Estrai email o telefono dal contactInfo
    const userEmail = contactInfo?.email || null;
    const userPhone = contactInfo?.phone || null;
    const contactMethod = contactInfo?.method || 'EMAIL';

    if (!userEmail && !userPhone) {
      return res.status(400).json({ 
        error: 'Per creare un ticket, fornisci almeno email o numero WhatsApp',
        requiresContact: true,
        suggestion: 'Scrivi il tuo contatto nel prossimo messaggio'
      });
    }

    // Recupera la storia della conversazione per context
    const session = await getPrisma().chatSession.findUnique({
      where: { sessionId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
          take: 10
        }
      }
    });

    const conversationContext = session?.messages
      ?.map(msg => `${msg.sender}: ${msg.message}`)
      ?.join('\n') || 'Nessun messaggio precedente';

    const ticket = await getPrisma().ticket.create({
      data: {
        sessionId,
        subject: `Supporto da Chat - Sessione ${sessionId.substring(0, 8)}`,
        description: `RICHIESTA DALL'UTENTE:\n${userInput || 'Richiesta di supporto'}\n\nCONTEXT CONVERSAZIONE:\n${conversationContext}`,
        userEmail,
        userPhone,
        contactMethod,
        priority: 'MEDIUM'
      }
    });

    // Log analytics
    await getPrisma().analytics.create({
      data: {
        eventType: 'ticket_from_chat',
        sessionId,
        eventData: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          contactMethod,
          hasContext: !!session?.messages?.length
        }
      }
    });

    res.json({
      success: true,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      message: `✅ Ticket #${ticket.ticketNumber} creato!\n\n📧 Ti contatteremo a: ${userEmail || userPhone}\n⏱️ Tempo risposta: 2-4 ore`
    });

  } catch (error) {
    console.error('Ticket from chat creation error:', error);
    res.status(500).json({ error: 'Failed to create ticket from chat' });
  }
});

export default router;