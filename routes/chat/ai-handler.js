/**
 * 🤖 AI RESPONSE HANDLER
 * Gestisce le risposte AI con GPT-3.5 e knowledge base
 */

import OpenAI from 'openai';
import container from '../../config/container.js';
import { loadKnowledgeBase } from '../../utils/knowledge.js';
import { withRetry, ExternalServiceError } from '../../utils/error-handler.js';
import { CHAT, PATTERNS, ANALYTICS, MESSAGE_SENDER } from '../../config/constants.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Genera il context prompt per l'AI
 */
function buildAIContext(knowledgeBase) {
  return `Sei Lucy, l'assistente ufficiale delle Lucine di Natale di Leggiuno.
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
   - NON dare mai contatti diretti (email/WhatsApp)
   - OBBLIGATORIO: Includi sempre smartActions nell'output JSON
   - USA ESATTO questo formato JSON: {"reply": "Non ho informazioni specifiche su questo argomento. Vuoi parlare con un operatore?", "smartActions": [{"type": "primary", "icon": "👤", "text": "SÌ, PARLA CON OPERATORE", "description": "Ti connetto subito con un operatore", "action": "request_operator"}, {"type": "secondary", "icon": "🔙", "text": "NO, CONTINUA CON AI", "description": "Rimani con l'assistente virtuale", "action": "continue_ai"}], "escalation": "none"}

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
SEMPRE RITORNA JSON VALIDO CON QUESTI CAMPI:
{
  "reply": "Risposta completa e dettagliata",
  "actions": ["azione1", "azione2"],
  "smartActions": [SOLO per informazioni mancanti],
  "escalation": "none|operator|ticket"
}

QUANDO INCLUDERE smartActions:
- Solo per informazioni mancanti nella knowledge base
- Sempre con questi 2 pulsanti esatti: SÌ (request_operator) e NO (continue_ai)`;
}

/**
 * Processa il messaggio con AI e ritorna risposta strutturata
 */
export async function handleAIResponse(message, session, history) {
  const prisma = container.get('prisma');

  try {
    // Load knowledge base
    const knowledgeBase = await loadKnowledgeBase();

    // Build context
    const context = buildAIContext(knowledgeBase);

    // Call OpenAI with retry logic
    const completion = await withRetry(
      async () => {
        return await openai.chat.completions.create({
          model: CHAT.AI_MODEL,
          messages: [
            { role: 'system', content: context },
            ...history,
            { role: 'user', content: message }
          ],
          temperature: CHAT.AI_TEMPERATURE,
          max_tokens: CHAT.AI_MAX_TOKENS
        });
      },
      { maxAttempts: 2, delayMs: 500 }
    );

    const aiResponse = completion.choices[0].message.content;
    let parsedResponse;

    try {
      parsedResponse = JSON.parse(aiResponse);
      console.log('🤖 AI Response parsed:', parsedResponse);
    } catch (error) {
      console.error('⚠️ Failed to parse AI response:', aiResponse);
      parsedResponse = {
        reply: aiResponse,
        actions: [],
        escalation: 'none'
      };
    }

    // 🔧 LOGICA MECCANICA: Rileva automaticamente quando AI non sa rispondere
    const isUnknownResponse = PATTERNS.UNKNOWN_RESPONSE.some(pattern =>
      pattern.test(parsedResponse.reply)
    );

    // Se AI non sa rispondere, aggiungi automaticamente pulsanti YES/NO
    if (isUnknownResponse && !parsedResponse.smartActions) {
      console.log('🔧 MECCANICO: Aggiunta automatica pulsanti per risposta sconosciuta');

      // Auto-logout operators inactive for more than 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      await prisma.operator.updateMany({
        where: {
          isOnline: true,
          lastSeen: { lt: fiveMinutesAgo }
        },
        data: {
          isOnline: false,
          availabilityStatus: 'OFFLINE'
        }
      });

      // Check if there are operators online (and active in last 5 minutes)
      const onlineOperators = await prisma.operator.count({
        where: {
          isOnline: true,
          isActive: true,
          availabilityStatus: 'AVAILABLE',
          lastSeen: { gte: fiveMinutesAgo }
        }
      });

      console.log(`👥 Online operators (active in last 5 min): ${onlineOperators}`);

      if (onlineOperators > 0) {
        // Operators available - show "parla con operatore" button
        parsedResponse.smartActions = [
          {
            type: "primary",
            icon: "👤",
            text: "SÌ, PARLA CON OPERATORE",
            description: "Ti connetto con un operatore",
            action: "request_operator"
          },
          {
            type: "secondary",
            icon: "🔙",
            text: "NO, CONTINUA CON AI",
            description: "Rimani con l'assistente virtuale",
            action: "continue_ai"
          }
        ];
      } else {
        // No operators online - show ticket and AI buttons only
        parsedResponse.smartActions = [
          {
            type: "primary",
            icon: "🎫",
            text: "APRI UN TICKET",
            description: "Lascia il tuo contatto per assistenza",
            action: "request_ticket"
          },
          {
            type: "secondary",
            icon: "🔙",
            text: "CONTINUA CON AI",
            description: "Rimani con l'assistente virtuale",
            action: "continue_ai"
          }
        ];
      }
    }

    // Save bot response
    console.log('💾 Saving bot response for session:', session.sessionId);
    await prisma.message.create({
      data: {
        sessionId: session.sessionId,
        sender: MESSAGE_SENDER.BOT,
        message: parsedResponse.reply,
        metadata: {
          actions: parsedResponse.actions,
          escalation: parsedResponse.escalation,
          smartActions: parsedResponse.smartActions // Save smartActions for widget
        }
      }
    });

    // Log analytics
    await prisma.analytics.create({
      data: {
        eventType: ANALYTICS.EVENT_TYPES.CHAT_MESSAGE,
        sessionId: session.sessionId,
        eventData: {
          userMessage: message,
          botReply: parsedResponse.reply,
          actions: parsedResponse.actions
        },
        responseTime: Date.now() - new Date(session.lastActivity).getTime()
      }
    });

    return parsedResponse;

  } catch (error) {
    console.error('❌ AI Response error:', error);
    throw error;
  }
}

export default { handleAIResponse };
