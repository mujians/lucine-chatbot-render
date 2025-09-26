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
    
    console.log('📨 NEW CHAT REQUEST:', { message, sessionId, timestamp: new Date().toISOString() });
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Messaggio richiesto' });
    }
    
    // Generate sessionId if not provided
    const finalSessionId = sessionId || `session-${Date.now()}`;

    // Get or create session in database
    let session = await prisma.chatSession.findUnique({
      where: { sessionId: finalSessionId },
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
          sessionId: finalSessionId,
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

    // Save user message and update session activity
    console.log('💾 Saving user message for session:', session.sessionId);
    
    await Promise.all([
      // Save message
      prisma.message.create({
        data: {
          sessionId: session.sessionId,
          sender: 'USER',
          message: message
        }
      }),
      // Update session last activity
      prisma.chatSession.update({
        where: { id: session.id },
        data: { lastActivity: new Date() }
      })
    ]);

    // Check if in live chat with operator
    if (session.status === 'WITH_OPERATOR' && session.operatorChats.length > 0) {
      return res.json({
        reply: `💬 Messaggio inviato all'operatore. Attendi la risposta...`,
        sessionId: session.sessionId,
        status: 'with_operator',
        operatorConnected: true
      });
    }

    // Check if user is in ticket collection workflow
    if (session.status === 'REQUESTING_TICKET') {
      return await handleTicketCollection(message, session, res);
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

    const context = `Sei Lucy, l'assistente ufficiale delle Lucine di Natale di Leggiuno.
Il tuo compito è fornire informazioni complete e dettagliate ai visitatori in italiano, usando un tono cordiale ma professionale.

**INFORMAZIONI SPECIFICHE DA FORNIRE:**

PREZZI BIGLIETTI - Quando chiesto sui prezzi, fornisci SEMPRE tutti i dettagli:
- Biglietto Intero: €9 - Ingresso standard nella fascia oraria scelta
- Biglietto Ridotto: €7 - Per bambini 3-12 anni e disabili  
- Biglietto SALTAFILA: €13 - Accesso prioritario senza code
- Biglietto OPEN: €25 - Accesso in qualsiasi fascia oraria senza prenotazione
- GRATIS per bambini sotto i 3 anni

ORARI E DATE - Fornisci sempre informazioni complete:
- Periodo: 6 dicembre 2025 - 6 gennaio 2026
- Orari: 17:30 - 23:00 (ultimo ingresso ore 22:30)
- Chiuso: 24 dicembre e 31 dicembre

**REGOLE FONDAMENTALI:**

1. RICHIESTA DIRETTA OPERATORE - Se l'utente chiede esplicitamente un operatore umano:
   - Frasi come: "operatore", "assistenza umana", "parlare con persona", "voglio un operatore", "help", "assistenza", "supporto umano", "request_operator"
   - Risposta: actions: ["richiesta_operatore"], escalation: "operator"

2. INFORMAZIONE MANCANTE - Solo se non hai l'informazione nella knowledge base:
   - actions: ["richiesta_operatore"], escalation: "operator"

3. DETTAGLI COMPLETI - Fornisci sempre informazioni complete e specifiche quando disponibili.

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
  "reply": "Risposta completa e dettagliata con tutte le informazioni richieste",
  "actions": ["azione1", "azione2"],
  "escalation": "none|operator|ticket"
}

ESEMPI DI RISPOSTE CORRETTE:

Domanda prezzi:
{
  "reply": "Ecco tutti i prezzi dei biglietti per le Lucine di Natale:\n\n🎫 **Biglietto Intero**: €9\nIngresso standard nella fascia oraria scelta\n\n🎫 **Biglietto Ridotto**: €7\nPer bambini 3-12 anni e disabili\n\n⚡ **Biglietto SALTAFILA**: €13\nAccesso prioritario senza code\n\n🌟 **Biglietto OPEN**: €25\nAccesso libero in qualsiasi momento\n\n👶 **GRATIS** per bambini sotto i 3 anni\n\nPuoi acquistare i tuoi biglietti direttamente sul nostro sito: [Acquista biglietti](https://lucinedinatale.it/products/biglietti)",
  "actions": ["biglietti_acquisto", "info_prezzi"],
  "escalation": "none"
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
      max_tokens: 400
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
    console.log('🤖 Saving bot response for session:', session.sessionId, 'Response:', parsedResponse);
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
      
      // Debug: Show ALL operators first
      const allOperators = await prisma.operator.findMany({
        select: { 
          id: true, 
          name: true, 
          isOnline: true, 
          isActive: true, 
          lastSeen: true 
        }
      });
      console.log('📊 ALL operators in database:', allOperators);
      
      // Check operator availability (più specifico)
      const availableOperator = await prisma.operator.findFirst({
        where: { 
          isOnline: true,
          isActive: true,
          // Operatore visto nelle ultime 10 minuti (per evitare operatori "zombie")
          lastSeen: {
            gte: new Date(Date.now() - 10 * 60 * 1000)
          }
        },
        select: { 
          id: true, 
          name: true, 
          displayName: true, 
          avatar: true, 
          specialization: true,
          isOnline: true,
          isActive: true,
          lastSeen: true
        }
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
          reply: `🟢 Ti sto connettendo con ${availableOperator.displayName || availableOperator.name}...\n\n${availableOperator.avatar || '👤'} Ti risponderò personalmente per aiutarti!`,
          sessionId: session.sessionId,
          status: 'connecting_operator',
          operator: {
            id: availableOperator.id,
            name: availableOperator.name,
            displayName: availableOperator.displayName || availableOperator.name,
            avatar: availableOperator.avatar || '👤',
            specialization: availableOperator.specialization
          }
        });
      } else {
        console.log('❌ NO OPERATORS AVAILABLE - Offering ticket');
        
        // Update session to track that we're in ticket flow
        await prisma.chatSession.update({
          where: { id: session.id },
          data: { status: 'REQUESTING_TICKET' }
        });

        // No operators available - offer ticket
        return res.json({
          reply: `⏰ **Al momento tutti i nostri operatori sono offline**\n\n🎫 Posso creare un **ticket di supporto** per te:\n📧 **Email**: Risposta in 2-4 ore\n📱 **WhatsApp**: Risposta più rapida\n\n**Per continuare, scrivi il tuo contatto:**\n✉️ Esempio: mario@email.com\n📲 Esempio: +39 123 456 7890`,
          sessionId: session.sessionId,
          status: 'ticket_collection',
          needsContact: true,
          smartActions: [
            {
              type: 'info',
              icon: '📝',
              text: 'Come funziona',
              description: 'Scrivi email o WhatsApp nel prossimo messaggio'
            },
            {
              type: 'secondary',
              icon: '🔙',
              text: 'Torna al Chat AI',
              description: 'Continua con Lucy (AI)'
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

/**
 * 🎫 Gestisce la raccolta dati per ticket quando operatori offline
 */
async function handleTicketCollection(message, session, res) {
  try {
    // Analizza il messaggio per estrarre contatti
    const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const phonePattern = /(?:\+39)?[\s]?([0-9]{10}|[0-9]{3}[\s]?[0-9]{3}[\s]?[0-9]{4})/;
    
    const emailMatch = message.match(emailPattern);
    const phoneMatch = message.match(phonePattern);
    
    if (emailMatch || phoneMatch) {
      // Contatto trovato - crea ticket
      const contactInfo = {
        email: emailMatch ? emailMatch[0] : null,
        phone: phoneMatch ? phoneMatch[1]?.replace(/\s/g, '') : null,
        method: emailMatch ? 'EMAIL' : 'WHATSAPP'
      };

      try {
        // Crea ticket direttamente con Prisma
        const ticket = await prisma.ticket.create({
          data: {
            sessionId: session.sessionId,
            subject: `Supporto Chat - ${session.sessionId.substring(0, 8)}`,
            description: `Richiesta dall'utente: ${message}`,
            userEmail: contactInfo.email,
            userPhone: contactInfo.phone,
            contactMethod: contactInfo.method,
            priority: 'MEDIUM'
          }
        });

        // Log analytics
        await prisma.analytics.create({
          data: {
            eventType: 'ticket_from_offline_chat',
            sessionId: session.sessionId,
            eventData: {
              ticketId: ticket.id,
              ticketNumber: ticket.ticketNumber,
              contactMethod: contactInfo.method
            }
          }
        });

        const ticketData = {
          success: true,
          ticketNumber: ticket.ticketNumber,
          message: `✅ **Ticket #${ticket.ticketNumber} creato!**\n\n📧 Ti contatteremo a: ${contactInfo.email || contactInfo.phone}\n⏱️ **Tempo di risposta**: 2-4 ore\n\nGrazie per aver contattato le Lucine di Natale! 🎄`
        };

        if (ticketData.success) {
          // Reset session status
          await prisma.chatSession.update({
            where: { id: session.id },
            data: { status: 'ACTIVE' }
          });

          return res.json({
            reply: ticketData.message,
            sessionId: session.sessionId,
            status: 'ticket_created',
            ticketNumber: ticketData.ticketNumber,
            smartActions: [
              {
                type: 'success',
                icon: '✅',
                text: `Ticket #${ticketData.ticketNumber}`,
                description: 'Creato con successo'
              },
              {
                type: 'secondary',
                icon: '💬',
                text: 'Nuova Conversazione',
                description: 'Continua a chattare con Lucy'
              }
            ]
          });
        }
      } catch (error) {
        console.error('Error creating ticket:', error);
      }
    }

    // Contatto non valido o errore - chiedi di nuovo
    if (message.toLowerCase().includes('torna') || message.toLowerCase().includes('annulla')) {
      // User wants to go back to AI chat
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { status: 'ACTIVE' }
      });

      return res.json({
        reply: `🔙 Perfetto! Sono tornato in modalità chat normale.\n\nCome posso aiutarti con le **Lucine di Natale**? 🎄`,
        sessionId: session.sessionId,
        status: 'back_to_ai'
      });
    }

    return res.json({
      reply: `❌ **Contatto non valido**\n\nInserisci un contatto valido:\n📧 **Email**: esempio@gmail.com\n📱 **WhatsApp**: +39 123 456 7890\n\n🔙 Oppure scrivi "torna" per continuare con la chat AI`,
      sessionId: session.sessionId,
      status: 'ticket_collection_retry',
      smartActions: [
        {
          type: 'info',
          icon: '💡',
          text: 'Suggerimento',
          description: 'Copia e incolla il tuo contatto'
        }
      ]
    });

  } catch (error) {
    console.error('Ticket collection error:', error);
    return res.status(500).json({
      error: 'Errore nella raccolta dati ticket',
      sessionId: session.sessionId
    });
  }
}

export default router;