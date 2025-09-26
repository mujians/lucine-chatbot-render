import express from 'express';
import OpenAI from 'openai';
import { prisma } from '../server.js';

/**
 * CHAT API V2 - Modular Architecture for Render.com
 * 
 * Nuova architettura modulare adaptata per Express.js + Prisma
 * Mantiene compatibilità API con frontend esistente
 */

const router = express.Router();

// Initialize services (singleton pattern)
let services = null;

/**
 * OpenAI Service - Gestione API OpenAI
 */
class OpenAIService {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
  }

  async generateChatResponse(context, userMessage, options = {}) {
    const { model = "gpt-3.5-turbo", maxTokens = 250, temperature = 0.3 } = options;

    try {
      const completion = await this.client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: context },
          { role: "user", content: userMessage }
        ],
        max_tokens: maxTokens,
        temperature
      });

      return {
        reply: completion?.choices?.[0]?.message?.content?.trim(),
        usage: completion.usage,
        model: completion.model
      };
    } catch (error) {
      if (error.code === 'insufficient_quota') {
        throw new Error('OpenAI quota exceeded');
      }
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

/**
 * Knowledge Service - Gestione Knowledge Base
 */
class KnowledgeService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 3600000; // 1 hour
  }

  async loadKnowledgeBase() {
    const cacheKey = 'knowledge_base';
    const now = Date.now();
    
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (now - cached.timestamp < this.cacheExpiry) {
        return cached.data;
      }
    }

    try {
      // Load from file system (existing implementation)
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'data', 'knowledge-base.json');
      const data = fs.readFileSync(filePath, 'utf8');
      const kb = JSON.parse(data);
      
      this.cache.set(cacheKey, { data: kb, timestamp: now });
      return kb;
    } catch (error) {
      return this.getDefaultKnowledgeBase();
    }
  }

  buildContextFromKnowledgeBase(kb) {
    const ticketUrl = kb.products?.main_ticket?.url || 
      'https://lucinedinatale.it/products/biglietto-parco-lucine-di-natale-2025';

    return `Sei l'assistente virtuale delle Lucine di Natale di Leggiuno. Rispondi sempre in italiano, in modo cordiale e preciso.

EVENTO: ${kb.event?.name || 'Lucine di Natale Leggiuno'}
Date: ${kb.event?.dates?.start} - ${kb.event?.dates?.end} (chiuso ${kb.event?.dates?.closed?.join(', ')})
Orari: ${kb.event?.hours?.open}-${kb.event?.hours?.close}
Luogo: ${kb.event?.location?.address}

BIGLIETTI:
- Intero: €${kb.tickets?.prices?.intero || '9'}
- Ridotto (3-12 anni): €${kb.tickets?.prices?.ridotto || '7'}  
- SaltaFila: €${kb.tickets?.prices?.saltafila || '13'}
- Open Ticket: €${kb.tickets?.prices?.open || '25'}
- Under 3: Gratis
🎫 ACQUISTA: ${ticketUrl}

PARCHEGGI: P1-P5, navetta gratuita

REGOLE:
- ACQUISTO: Se qualcuno vuole comprare biglietti, rispondi con "BOOKING_REQUEST"
- WHATSAPP: Se chiede notifiche, rispondi con "WHATSAPP_REQUEST"
- Date 24 o 31 dicembre: avvisa che è CHIUSO
- Per domande complesse suggerisci: ${kb.contact?.email || 'info@lucinedinatale.it'}`;
  }

  isLowConfidenceReply(reply) {
    const indicators = ['non sono sicuro', 'non so', 'non ho informazioni'];
    return indicators.some(indicator => reply.toLowerCase().includes(indicator));
  }

  getDefaultKnowledgeBase() {
    return {
      event: {
        name: "Lucine di Natale Leggiuno",
        dates: { start: "6 dicembre", end: "6 gennaio", closed: ["24 dicembre", "31 dicembre"] },
        hours: { open: "17:30", close: "23:00" },
        location: { address: "Leggiuno, Varese" }
      },
      tickets: { prices: { intero: "9", ridotto: "7", saltafila: "13", open: "25" } },
      products: { main_ticket: { url: "https://lucinedinatale.it/products/biglietto-parco-lucine-di-natale-2025" } },
      contact: { email: "info@lucinedinatale.it" }
    };
  }
}

/**
 * Session Service - Gestione sessioni con Prisma
 */
class SessionService {
  async getSession(sessionId, req) {
    let session = await prisma.chatSession.findUnique({
      where: { sessionId },
      include: {
        messages: { orderBy: { timestamp: 'desc' }, take: 10 },
        operatorChats: { where: { endedAt: null } }
      }
    });

    if (!session) {
      session = await prisma.chatSession.create({
        data: {
          sessionId,
          userIp: req.ip,
          userAgent: req.headers['user-agent']
        },
        include: {
          messages: { orderBy: { timestamp: 'desc' }, take: 10 },
          operatorChats: { where: { endedAt: null } }
        }
      });
    }

    return session;
  }

  async addMessage(sessionId, role, content, metadata = {}) {
    return await prisma.message.create({
      data: {
        sessionId,
        role,
        content,
        metadata,
        timestamp: new Date()
      }
    });
  }

  checkRateLimit(req) {
    // Simplified rate limiting - can enhance later
    return { allowed: true, remaining: 10 };
  }
}

/**
 * Message Handler - Processamento messaggi
 */
class MessageHandler {
  constructor(services) {
    this.openAI = services.openAI;
    this.knowledge = services.knowledge;
    this.session = services.session;
  }

  async processMessage(message, sessionId, req) {
    const session = await this.session.getSession(sessionId, req);
    
    // Rate limiting
    const rateLimit = this.session.checkRateLimit(req);
    if (!rateLimit.allowed) {
      throw new Error('Rate limit exceeded');
    }

    // Load knowledge base
    const kb = await this.knowledge.loadKnowledgeBase();
    const context = this.knowledge.buildContextFromKnowledgeBase(kb);

    // Generate AI response
    const aiResponse = await this.openAI.generateChatResponse(context, message);
    let reply = aiResponse.reply;

    // Handle special intents
    if (reply.includes('WHATSAPP_REQUEST')) {
      return this.handleWhatsAppRequest(message, session, kb);
    }

    if (reply.includes('BOOKING_REQUEST')) {
      return this.handleBookingRequest(message, session, kb);
    }

    // Check for low confidence
    if (this.knowledge.isLowConfidenceReply(reply)) {
      return this.handleLowConfidence(message, session, kb);
    }

    // Save message to database
    await this.session.addMessage(sessionId, 'user', message);
    await this.session.addMessage(sessionId, 'assistant', reply);

    // Generate smart actions
    const smartActions = this.generateSmartActions(reply, message, kb);

    return {
      reply,
      smartActions,
      sessionId
    };
  }

  handleWhatsAppRequest(message, session, kb) {
    const phonePattern = /(\+39\s?)?(\d{3}\s?\d{3}\s?\d{4}|\d{10})/;
    const phoneMatch = message.match(phonePattern);
    
    if (phoneMatch) {
      const phoneNumber = phoneMatch[0].replace(/\s/g, '');
      const formattedPhone = phoneNumber.startsWith('+39') ? phoneNumber : '+39' + phoneNumber;
      
      return {
        reply: `✅ Perfetto! Ho salvato il tuo numero WhatsApp: ${formattedPhone}\n\nRiceverai notifiche per:\n📱 Aggiornamenti biglietti\n🎫 Conferme prenotazione\n💬 Supporto prioritario`,
        sessionId: session.sessionId,
        whatsapp_registered: true,
        smartActions: [
          { type: 'success', icon: '✅', text: 'WhatsApp Attivato', description: 'Notifiche attive' }
        ]
      };
    }

    return {
      reply: `📱 **Attiva notifiche WhatsApp**\n\nCondividi il tuo numero WhatsApp:\n\n**Esempio:** +39 123 456 7890\n\n✨ Riceverai notifiche instantanee!`,
      sessionId: session.sessionId,
      smartActions: [
        { type: 'info', icon: '📱', text: 'Formato: +39 XXX XXX XXXX', description: 'Inserisci nel prossimo messaggio' }
      ]
    };
  }

  handleBookingRequest(message, session, kb) {
    const bookingInfo = this.parseBookingRequest(message);
    
    if (bookingInfo.hasDate) {
      return {
        reply: `🎫 Per prenotare biglietti per ${bookingInfo.dateText}, usa il calendario:\n\n${kb.products.main_ticket.url}\n\n📅 Seleziona data e orario\n🛒 Aggiungi al carrello`,
        sessionId: session.sessionId,
        smartActions: [
          { 
            type: 'primary', 
            icon: '🎫', 
            text: 'Prenota Online', 
            url: kb.products.main_ticket.url,
            description: bookingInfo.dateText 
          }
        ]
      };
    }

    return {
      reply: `🎫 Per prenotare biglietti, usa il calendario:\n\n${kb.products.main_ticket.url}`,
      sessionId: session.sessionId,
      smartActions: [
        { type: 'primary', icon: '🎫', text: 'Prenota Online', url: kb.products.main_ticket.url }
      ]
    };
  }

  handleLowConfidence(message, session, kb) {
    return {
      reply: `🤔 Non ho trovato una risposta precisa alla tua domanda.\n\n**Vuoi che contatti un operatore umano?**\n\nRispondi "Sì, contatta operatore" per assistenza personalizzata.\n\n📧 Email: ${kb.contact.email}`,
      sessionId: session.sessionId,
      needsConfirmation: true,
      smartActions: [
        { type: 'secondary', icon: '📧', text: 'Email Supporto', url: `mailto:${kb.contact.email}` }
      ]
    };
  }

  generateSmartActions(reply, userMessage, kb) {
    const actions = [];
    const lowerReply = reply.toLowerCase();
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerReply.includes('bigliett') || lowerMessage.includes('bigliett')) {
      actions.push({
        type: 'primary',
        icon: '🎫',
        text: 'Prenota Biglietti',
        url: kb.products?.main_ticket?.url,
        description: 'Calendario disponibilità'
      });
    }
    
    if (lowerReply.includes('parcheggi') || lowerMessage.includes('parcheggi')) {
      actions.push({
        type: 'info',
        icon: '🚗',
        text: 'Mappa Parcheggi',
        url: 'https://maps.google.com/search/parcheggi+leggiuno',
        description: 'P1-P5 con navetta'
      });
    }
    
    if (actions.length < 2) {
      actions.push({
        type: 'secondary',
        icon: '📱',
        text: 'Attiva WhatsApp',
        action: 'whatsapp_signup',
        description: 'Notifiche istantanee'
      });
    }
    
    return actions.slice(0, 3);
  }

  parseBookingRequest(message) {
    const lowerMessage = message.toLowerCase();
    const datePattern = /(\d{1,2})\s+(dicembre|gennaio)/i;
    const match = lowerMessage.match(datePattern);
    
    return {
      hasDate: !!match,
      dateText: match ? `${match[1]} ${match[2]}` : null
    };
  }
}

/**
 * Initialize services
 */
function initializeServices() {
  if (services) return services;

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY required');
  }

  const openAI = new OpenAIService(process.env.OPENAI_API_KEY);
  const knowledge = new KnowledgeService();
  const session = new SessionService();
  const messageHandler = new MessageHandler({ openAI, knowledge, session });

  services = { openAI, knowledge, session, messageHandler };
  
  console.log('✅ Chat API v2 services initialized');
  return services;
}

/**
 * Main chat endpoint - V2 modular architecture
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();

  try {
    // Initialize services
    const chatServices = initializeServices();

    const { message, sessionId } = req.body;
    console.log('📨 CHAT V2 REQUEST:', { message, sessionId, timestamp: new Date().toISOString() });

    // Input validation
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Messaggio richiesto',
        sessionId: sessionId || `session-${Date.now()}`
      });
    }

    if (message.length > 1000) {
      return res.status(400).json({ 
        error: 'Messaggio troppo lungo (max 1000 caratteri)',
        sessionId: sessionId || `session-${Date.now()}`
      });
    }

    // Generate sessionId if not provided
    const finalSessionId = sessionId || `session-${Date.now()}`;

    // Process message
    const result = await chatServices.messageHandler.processMessage(
      message.trim(),
      finalSessionId,
      req
    );

    // Add performance metadata
    const responseTime = Date.now() - startTime;
    result.metadata = {
      response_time_ms: responseTime,
      timestamp: new Date().toISOString(),
      version: '2.0.0'
    };

    console.log('✅ CHAT V2 RESPONSE:', { 
      sessionId: result.sessionId, 
      hasReply: !!result.reply,
      responseTime 
    });

    return res.json(result);

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    console.error('❌ CHAT V2 ERROR:', {
      error: error.message,
      sessionId: req.body?.sessionId,
      responseTime
    });

    let errorMessage = 'Si è verificato un errore tecnico.';
    let statusCode = 500;

    if (error.message.includes('OpenAI')) {
      errorMessage = 'Servizio AI temporaneamente non disponibile.';
    } else if (error.message.includes('quota')) {
      errorMessage = 'Servizio temporaneamente limitato.';
    } else if (error.message.includes('Rate limit')) {
      statusCode = 429;
      errorMessage = 'Troppi messaggi. Riprova tra qualche istante.';
    }

    return res.status(statusCode).json({
      error: errorMessage,
      sessionId: req.body?.sessionId || `error-${Date.now()}`,
      metadata: {
        response_time_ms: responseTime,
        timestamp: new Date().toISOString(),
        version: '2.0.0'
      }
    });
  }
});

/**
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const chatServices = initializeServices();
    
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Test OpenAI (simple ping)
    await chatServices.openAI.generateChatResponse('Test', 'ping', { maxTokens: 5 });
    
    res.json({
      status: 'healthy',
      version: '2.0.0',
      services: {
        database: 'connected',
        openai: 'connected',
        knowledge: 'loaded'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;