import express from 'express';
import OpenAI from 'openai';
import { prisma } from '../server.js';
import { loadKnowledgeBase } from '../utils/knowledge.js';

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Main chat endpoint
router.post('/', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Messaggio richiesto' });
    }

    // Get or create session in database
    let session = await prisma.chatSession.findUnique({
      where: { sessionId: sessionId || `session-${Date.now()}` },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 10
        },
        operatorChats: {
          where: { endedAt: null }
        }
      }
    });

    if (!session) {
      session = await prisma.chatSession.create({
        data: {
          sessionId: sessionId || `session-${Date.now()}`,
          userIp: req.ip,
          userAgent: req.headers['user-agent']
        },
        include: {
          messages: {
            orderBy: { timestamp: 'desc' },
            take: 10
          },
          operatorChats: {
            where: { endedAt: null }
          }
        }
      });
    }

    // Save user message
    await prisma.message.create({
      data: {
        sessionId: session.sessionId,
        sender: 'USER',
        message: message
      }
    });

    // Check if in live chat with operator
    if (session.status === 'WITH_OPERATOR' && session.operatorChats.length > 0) {
      return res.json({
        reply: `💬 Messaggio inviato all'operatore. Attendi la risposta...`,
        sessionId: session.sessionId,
        status: 'with_operator',
        operatorConnected: true
      });
    }

    // Load knowledge base
    const knowledgeBase = await loadKnowledgeBase();
    
    // Build context with history
    const history = session.messages
      .reverse()
      .slice(0, 5)
      .map(msg => ({
        role: msg.sender === 'USER' ? 'user' : 'assistant',
        content: msg.message
      }));

    const context = `Sei l'assistente ufficiale di lucinedinatale.it.
Il tuo compito è rispondere ai visitatori in italiano in modo cordiale, conciso e sempre con il formato JSON indicato.

Usa SOLO le informazioni dalla knowledge base per rispondere.

**REGOLE FONDAMENTALI:**

1. RICHIESTA DIRETTA OPERATORE - Se l'utente chiede esplicitamente un operatore umano:
   - Frasi come: "operatore", "assistenza umana", "parlare con persona", "voglio un operatore", "help", "assistenza", "supporto umano"
   - Risposta: actions: ["richiesta_operatore"], escalation: "operator"

2. INFORMAZIONE MANCANTE - Se non hai l'informazione nella knowledge base:
   - actions: ["richiesta_operatore"], escalation: "operator"

Knowledge Base:
${JSON.stringify(knowledgeBase, null, 2)}

=== AZIONI DISPONIBILI ===
- biglietti_acquisto → Link diretto per l'acquisto biglietti
- richiesta_operatore → Escalation a operatore umano (chat diretta)
- info_parcheggi → Dettagli su parcheggi e navette
- info_orari → Orari di apertura e chiusura
- info_location → Come arrivare e mappa
- info_prezzi → Informazioni prezzi biglietti

=== FORMATO RISPOSTA OBBLIGATORIO ===
{
  "reply": "Risposta testuale breve e cordiale",
  "actions": ["azione1", "azione2"],
  "escalation": "none|operator|ticket"
}`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: context },
        ...history,
        { role: 'user', content: message }
      ],
      temperature: 0.3,
      max_tokens: 200
    });

    const aiResponse = completion.choices[0].message.content;
    let parsedResponse;

    try {
      parsedResponse = JSON.parse(aiResponse);
      console.log('🤖 AI Response parsed:', parsedResponse);
    } catch (error) {
      console.error('Failed to parse AI response:', aiResponse);
      parsedResponse = {
        reply: aiResponse,
        actions: [],
        escalation: 'none'
      };
    }

    // Save bot response
    await prisma.message.create({
      data: {
        sessionId: session.sessionId,
        sender: 'BOT',
        message: parsedResponse.reply,
        metadata: {
          actions: parsedResponse.actions,
          escalation: parsedResponse.escalation
        }
      }
    });

    // Log analytics
    await prisma.analytics.create({
      data: {
        eventType: 'chat_message',
        sessionId: session.sessionId,
        eventData: {
          userMessage: message,
          botReply: parsedResponse.reply,
          actions: parsedResponse.actions
        },
        responseTime: Date.now() - new Date(session.lastActivity).getTime()
      }
    });

    // Handle escalation
    if (parsedResponse.escalation === 'operator') {
      console.log('🔍 ESCALATION REQUEST - Checking for operators...');
      
      // Check operator availability
      const availableOperator = await prisma.operator.findFirst({
        where: { isOnline: true }
      });

      console.log('🎯 Available operator found:', availableOperator);

      if (availableOperator) {
        // Update session status
        await prisma.chatSession.update({
          where: { id: session.id },
          data: { status: 'WITH_OPERATOR' }
        });

        // Create operator chat
        await prisma.operatorChat.create({
          data: {
            sessionId: session.sessionId,
            operatorId: availableOperator.id
          }
        });

        return res.json({
          reply: `🟢 Ti sto connettendo con ${availableOperator.name}...`,
          sessionId: session.sessionId,
          status: 'connecting_operator',
          operator: {
            id: availableOperator.id,
            name: availableOperator.name
          }
        });
      } else {
        console.log('❌ NO OPERATORS AVAILABLE - Offering ticket');
        // No operators available - offer ticket
        return res.json({
          reply: `⏰ Al momento non ci sono operatori disponibili.\n\n📝 Vuoi aprire un ticket di supporto?`,
          sessionId: session.sessionId,
          status: 'ticket_request',
          smartActions: [
            {
              type: 'ticket_email',
              icon: '📧',
              text: 'Email Support',
              description: 'Ricevi risposta via email'
            },
            {
              type: 'ticket_whatsapp',
              icon: '📱',
              text: 'WhatsApp Support',
              description: 'Ricevi risposta su WhatsApp'
            }
          ]
        });
      }
    }

    // Return normal response
    res.json({
      reply: parsedResponse.reply,
      sessionId: session.sessionId,
      status: 'success',
      actions: parsedResponse.actions,
      escalation: parsedResponse.escalation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Errore temporaneo del servizio',
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// Poll for new messages (for live chat)
router.get('/poll/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { lastMessageTime } = req.query;

    const whereClause = {
      sessionId,
      sender: 'OPERATOR'
    };

    // If lastMessageTime provided, get only newer messages
    if (lastMessageTime) {
      whereClause.timestamp = {
        gt: new Date(lastMessageTime)
      };
    }

    const newMessages = await prisma.message.findMany({
      where: whereClause,
      orderBy: { timestamp: 'asc' }
    });

    // Get current session status
    const session = await prisma.chatSession.findUnique({
      where: { sessionId },
      include: {
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

    res.json({
      messages: newMessages,
      hasNewMessages: newMessages.length > 0,
      sessionStatus: session?.status || 'ACTIVE',
      operator: session?.operatorChats[0]?.operator || null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Poll error:', error);
    res.status(500).json({ error: 'Failed to poll messages' });
  }
});

// Get chat history
router.get('/history/:sessionId', async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: { sessionId: req.params.sessionId },
      orderBy: { timestamp: 'asc' }
    });

    res.json({ 
      sessionId: req.params.sessionId,
      messages,
      count: messages.length 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Debug endpoint per testare il database
router.get('/debug', async (req, res) => {
  try {
    // Test database connection
    await prisma.$connect();
    
    // Try to count sessions
    const sessionCount = await prisma.chatSession.count();
    
    res.json({
      status: 'ok',
      database: 'connected',
      sessionCount,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        hasOpenAI: !!process.env.OPENAI_API_KEY,
        hasDatabaseUrl: !!process.env.DATABASE_URL
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      code: error.code
    });
  }
});

export default router;