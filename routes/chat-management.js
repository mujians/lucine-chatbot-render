import express from 'express';
import container from '../config/container.js';
import { authenticateToken, validateSession } from '../middleware/security.js';

const router = express.Router();
const prisma = container.get('prisma');

/**
 * 📋 GESTIONE STATI CHAT - Endpoint per operatori
 */

// Aggiorna stato di una chat
router.post('/update-status', authenticateToken, validateSession, async (req, res) => {
  try {
    const { sessionId, status, notes } = req.body;
    const operatorId = req.user.id;
    
    console.log('📝 Update chat status request:', { sessionId, status, operatorId });
    
    if (!sessionId || !status) {
      return res.status(400).json({ error: 'SessionId and status required' });
    }

    // Verifica che l'operatore sia assegnato a questa chat
    const operatorChat = await prisma.operatorChat.findFirst({
      where: {
        sessionId,
        operatorId,
        endedAt: null
      },
      include: {
        session: true,
        operator: true
      }
    });

    if (!operatorChat) {
      return res.status(403).json({ error: 'Chat not assigned to this operator' });
    }

    // Stati validi secondo le tue specifiche
    const validStatuses = ['RESOLVED', 'NOT_RESOLVED', 'WAITING_CLIENT', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status', 
        validStatuses 
      });
    }

    // Aggiorna sessione
    const updatedSession = await prisma.chatSession.update({
      where: { sessionId },
      data: { 
        status,
        lastActivity: new Date()
      }
    });

    // Se chiusura definitiva, chiudi operatorChat
    if (['RESOLVED', 'NOT_RESOLVED', 'CANCELLED'].includes(status)) {
      await prisma.operatorChat.update({
        where: { id: operatorChat.id },
        data: { 
          endedAt: new Date(),
          notes: notes || operatorChat.notes
        }
      });
    }

    // Log analytics
    await prisma.analytics.create({
      data: {
        eventType: 'chat_status_changed',
        sessionId,
        eventData: {
          newStatus: status,
          operatorId,
          previousStatus: operatorChat.session.status,
          notes: notes || null
        }
      }
    });

    res.json({
      success: true,
      sessionId,
      newStatus: status,
      operator: {
        id: operatorChat.operator.id,
        name: operatorChat.operator.name
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Chat status update error:', error);
    res.status(500).json({ 
      error: 'Failed to update chat status',
      details: error.message 
    });
  }
});

// Aggiungi nota interna
router.post('/add-note', authenticateToken, validateSession, async (req, res) => {
  try {
    const { sessionId, content } = req.body;
    const operatorId = req.user.id;
    
    console.log('📝 Add internal note request:', { sessionId, operatorId, contentLength: content?.length });
    
    if (!sessionId || !content || content.trim().length === 0) {
      return res.status(400).json({ error: 'SessionId and content required' });
    }

    // Verifica che l'operatore abbia accesso a questa chat
    const operatorChat = await prisma.operatorChat.findFirst({
      where: {
        sessionId,
        operatorId
      },
      include: {
        operator: {
          select: { id: true, name: true }
        }
      }
    });

    if (!operatorChat) {
      return res.status(403).json({ error: 'Chat not accessible to this operator' });
    }

    // Crea nota interna
    const note = await prisma.internalNote.create({
      data: {
        content: content.trim(),
        operatorId,
        sessionId
      },
      include: {
        operator: {
          select: { id: true, name: true }
        }
      }
    });

    // Log analytics
    await prisma.analytics.create({
      data: {
        eventType: 'internal_note_added',
        sessionId,
        eventData: {
          noteId: note.id,
          operatorId,
          contentLength: content.trim().length
        }
      }
    });

    res.json({
      success: true,
      note: {
        id: note.id,
        content: note.content,
        operator: note.operator,
        createdAt: note.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Add note error:', error);
    res.status(500).json({ 
      error: 'Failed to add note',
      details: error.message 
    });
  }
});

// Ottieni cronologia chat con note interne
router.get('/history/:sessionId', authenticateToken, validateSession, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const operatorId = req.user.id;
    
    console.log('📚 Chat history request:', { sessionId, operatorId });
    
    // Verifica accesso
    const operatorChat = await prisma.operatorChat.findFirst({
      where: {
        sessionId,
        operatorId
      }
    });

    if (!operatorChat) {
      return res.status(403).json({ error: 'Chat not accessible to this operator' });
    }

    // Ottieni cronologia completa
    const [session, messages, internalNotes] = await Promise.all([
      // Sessione con info operatore
      prisma.chatSession.findUnique({
        where: { sessionId },
        include: {
          operatorChats: {
            include: {
              operator: {
                select: { id: true, name: true, displayName: true }
              }
            }
          }
        }
      }),
      
      // Messaggi chat
      prisma.message.findMany({
        where: { sessionId },
        orderBy: { timestamp: 'asc' },
        take: 100 // Limite ragionevole
      }),
      
      // Note interne
      prisma.internalNote.findMany({
        where: { sessionId },
        include: {
          operator: {
            select: { id: true, name: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      session: {
        id: session.sessionId,
        status: session.status,
        startedAt: session.startedAt,
        lastActivity: session.lastActivity,
        operators: session.operatorChats.map(oc => ({
          id: oc.operator.id,
          name: oc.operator.name,
          displayName: oc.operator.displayName,
          startedAt: oc.startedAt,
          endedAt: oc.endedAt,
          rating: oc.rating
        }))
      },
      messages,
      internalNotes,
      totalMessages: messages.length,
      totalNotes: internalNotes.length
    });

  } catch (error) {
    console.error('❌ Chat history error:', error);
    res.status(500).json({ 
      error: 'Failed to get chat history',
      details: error.message 
    });
  }
});

// Dashboard chat attive - secondo le tue specifiche
router.get('/active-chats', authenticateToken, validateSession, async (req, res) => {
  try {
    const { filter = 'all', limit = 50 } = req.query;
    const operatorId = req.user.id;
    
    console.log('📊 Active chats dashboard request:', { filter, operatorId });
    
    let whereClause = {};
    
    // Filtri secondo le tue specifiche
    switch (filter) {
      case 'assigned':
        whereClause = {
          operatorChats: {
            some: {
              operatorId,
              endedAt: null
            }
          }
        };
        break;
        
      case 'unassigned':
        whereClause = {
          status: 'ACTIVE',
          operatorChats: {
            none: {}
          }
        };
        break;
        
      case 'waiting':
        whereClause = {
          status: 'WAITING_CLIENT'
        };
        break;
        
      case 'with_operator':
        whereClause = {
          status: 'WITH_OPERATOR',
          operatorChats: {
            some: {
              endedAt: null
            }
          }
        };
        break;
        
      default: // 'all'
        whereClause = {
          status: {
            in: ['ACTIVE', 'WITH_OPERATOR', 'WAITING_CLIENT']
          }
        };
    }

    const activeSessions = await prisma.chatSession.findMany({
      where: whereClause,
      include: {
        operatorChats: {
          where: { endedAt: null },
          include: {
            operator: {
              select: { id: true, name: true, displayName: true }
            }
          }
        },
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1 // Solo ultimo messaggio per preview
        },
        _count: {
          select: {
            messages: true,
            internalNotes: true
          }
        }
      },
      orderBy: { lastActivity: 'desc' },
      take: parseInt(limit)
    });

    // Statistiche rapide
    const stats = await prisma.chatSession.groupBy({
      by: ['status'],
      where: {
        status: {
          in: ['ACTIVE', 'WITH_OPERATOR', 'WAITING_CLIENT', 'RESOLVED', 'NOT_RESOLVED']
        },
        lastActivity: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Ultime 24h
        }
      },
      _count: true
    });

    res.json({
      chats: activeSessions.map(session => ({
        sessionId: session.sessionId,
        status: session.status,
        startedAt: session.startedAt,
        lastActivity: session.lastActivity,
        operator: session.operatorChats[0]?.operator || null,
        lastMessage: session.messages[0] || null,
        messageCount: session._count.messages,
        notesCount: session._count.internalNotes,
        isAssignedToMe: session.operatorChats.some(oc => oc.operatorId === operatorId)
      })),
      stats: stats.reduce((acc, stat) => {
        acc[stat.status.toLowerCase()] = stat._count;
        return acc;
      }, {}),
      filter,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Active chats dashboard error:', error);
    res.status(500).json({ 
      error: 'Failed to get active chats',
      details: error.message 
    });
  }
});

// Crea ticket da chat - integrazione secondo le tue specifiche
router.post('/create-ticket', authenticateToken, validateSession, async (req, res) => {
  try {
    const { sessionId, subject, description, priority = 'MEDIUM' } = req.body;
    const operatorId = req.user.id;
    
    console.log('🎫 Create ticket from chat request:', { sessionId, operatorId, priority });
    
    if (!sessionId || !subject || !description) {
      return res.status(400).json({ error: 'SessionId, subject and description required' });
    }

    // Verifica accesso alla chat
    const operatorChat = await prisma.operatorChat.findFirst({
      where: {
        sessionId,
        operatorId
      },
      include: {
        session: {
          include: {
            messages: {
              orderBy: { timestamp: 'desc' },
              take: 5 // Ultimi 5 messaggi per contesto
            }
          }
        },
        operator: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!operatorChat) {
      return res.status(403).json({ error: 'Chat not accessible to this operator' });
    }

    // Estrai info utente dai messaggi se disponibile
    const userMessages = operatorChat.session.messages.filter(msg => msg.sender === 'USER');
    const lastUserMessage = userMessages[0];
    
    // Costruisci descrizione completa con contesto chat
    const fullDescription = `
TICKET CREATO DA CHAT
=====================

Sessione: ${sessionId}
Operatore: ${operatorChat.operator.name} (${operatorChat.operator.email})
Data conversazione: ${operatorChat.startedAt.toLocaleString('it-IT')}

DESCRIZIONE PROBLEMA:
${description}

ULTIMI MESSAGGI CHAT:
${operatorChat.session.messages.map(msg => 
  `[${msg.timestamp.toLocaleTimeString('it-IT')}] ${msg.sender}: ${msg.message}`
).join('\n')}

INFORMAZIONI TECNICHE:
- SessionId: ${sessionId}
- User IP: ${operatorChat.session.userIp || 'N/A'}
- User Agent: ${operatorChat.session.userAgent || 'N/A'}
`.trim();

    // Crea ticket collegato alla chat
    const ticket = await prisma.ticket.create({
      data: {
        sessionId,
        subject,
        description: fullDescription,
        priority,
        operatorId,
        status: 'OPEN',
        contactMethod: 'CHAT',
        userEmail: null, // Da implementare se serve raccolta email
        userPhone: null
      },
      include: {
        assignedTo: {
          select: { id: true, name: true }
        }
      }
    });

    // Aggiungi nota interna automatica
    await prisma.internalNote.create({
      data: {
        content: `🎫 Ticket #${ticket.ticketNumber} creato automaticamente da questa chat.`,
        operatorId,
        sessionId
      }
    });

    // Aggiorna stato chat se necessario
    await prisma.chatSession.update({
      where: { sessionId },
      data: { 
        status: 'RESOLVED', // Considera la chat risolta se è stato creato ticket
        lastActivity: new Date()
      }
    });

    // Log analytics
    await prisma.analytics.create({
      data: {
        eventType: 'ticket_created_from_chat',
        sessionId,
        eventData: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          operatorId,
          priority,
          chatDuration: Math.round((Date.now() - operatorChat.startedAt.getTime()) / (1000 * 60))
        }
      }
    });

    res.json({
      success: true,
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.createdAt,
        assignedTo: ticket.assignedTo
      },
      sessionId,
      linkage: {
        chatLinked: true,
        internalNoteAdded: true,
        chatStatusUpdated: 'RESOLVED'
      }
    });

  } catch (error) {
    console.error('❌ Create ticket from chat error:', error);
    res.status(500).json({ 
      error: 'Failed to create ticket from chat',
      details: error.message 
    });
  }
});

export default router;