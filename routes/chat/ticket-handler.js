/**
 * 🎫 TICKET COLLECTION HANDLER
 * Gestisce la raccolta dati per creazione ticket quando operatori offline
 */

import container from '../../config/container.js';
import { PATTERNS, CONTACT_METHOD, PRIORITY, SESSION_STATUS, ANALYTICS } from '../../config/constants.js';

/**
 * Gestisce il flusso di raccolta dati multi-step per ticket creation
 * Step 1: Nome
 * Step 2: Contatto (email o WhatsApp)
 * Step 3: Altre informazioni (opzionale)
 */
export async function handleTicketCollection(message, session, res) {
  const prisma = container.get('prisma');

  try {
    // Check if user wants to cancel
    if (message.toLowerCase().includes('annulla') || message.toLowerCase().includes('torna')) {
      await prisma.chatSession.update({
        where: { id: session.id },
        data: {
          status: SESSION_STATUS.ACTIVE,
          metadata: null // Clear ticket data
        }
      });

      return res.json({
        reply: `🔙 Perfetto! Sono tornato in modalità chat normale.\n\nCome posso aiutarti con le **Lucine di Natale**? 🎄`,
        sessionId: session.sessionId,
        status: 'back_to_ai'
      });
    }

    // Get or initialize ticket data from session metadata
    const ticketData = session.metadata?.ticketData || {};

    // STEP 1: Collect Name
    if (!ticketData.name) {
      // Validate name (at least 2 characters, no numbers)
      if (message.length >= 2 && !/\d/.test(message)) {
        ticketData.name = message.trim();

        await prisma.chatSession.update({
          where: { id: session.id },
          data: {
            metadata: { ticketData }
          }
        });

        return res.json({
          reply: `Piacere di conoscerti, **${ticketData.name}**! 👋\n\n📧 **Come preferisci essere contattato?**\n\nInviami:\n• La tua **email** (es: mario.rossi@gmail.com)\n• Oppure il tuo numero **WhatsApp** (es: +39 333 123 4567)\n\n💡 _Scrivi "annulla" per tornare alla chat_`,
          sessionId: session.sessionId,
          status: 'collecting_contact'
        });
      } else {
        return res.json({
          reply: `❌ Nome non valido.\n\nPer favore, inserisci il tuo **nome** (almeno 2 caratteri).\n\n💡 _Scrivi "annulla" per tornare alla chat_`,
          sessionId: session.sessionId,
          status: 'collecting_name_retry'
        });
      }
    }

    // STEP 2: Collect Contact (email or phone)
    if (!ticketData.contact) {
      const emailMatch = message.match(PATTERNS.EMAIL);
      const phoneMatch = message.match(PATTERNS.PHONE_IT);

      if (emailMatch || phoneMatch) {
        ticketData.contact = {
          email: emailMatch ? emailMatch[0] : null,
          phone: phoneMatch ? phoneMatch[1]?.replace(/\s/g, '') : null,
          method: emailMatch ? CONTACT_METHOD.EMAIL : CONTACT_METHOD.WHATSAPP
        };

        await prisma.chatSession.update({
          where: { id: session.id },
          data: {
            metadata: { ticketData }
          }
        });

        return res.json({
          reply: `Perfetto! Ti contatterò su **${ticketData.contact.email || ticketData.contact.phone}** ✅\n\n📝 **C'è qualcos'altro che vuoi aggiungere?**\n\nPuoi darmi più dettagli sul tuo problema o sulla tua richiesta.\n\n_Oppure scrivi "no" o "basta" per procedere._`,
          sessionId: session.sessionId,
          status: 'collecting_additional_info'
        });
      } else {
        return res.json({
          reply: `❌ **Contatto non valido**\n\nInserisci un contatto valido:\n📧 **Email**: esempio@gmail.com\n📱 **WhatsApp**: +39 333 123 4567\n\n💡 _Scrivi "annulla" per tornare alla chat_`,
          sessionId: session.sessionId,
          status: 'collecting_contact_retry'
        });
      }
    }

    // STEP 3: Collect Additional Info (optional)
    if (!ticketData.additionalInfo) {
      const skipWords = ['no', 'basta', 'ok', 'niente', 'nulla', 'skip'];
      const shouldSkip = skipWords.some(word => message.toLowerCase().trim() === word);

      if (!shouldSkip && message.length > 5) {
        ticketData.additionalInfo = message.trim();
      } else {
        ticketData.additionalInfo = '';
      }

      // Now we have all data - CREATE TICKET
      try {
        // Build description from chat history + additional info
        const chatHistory = await prisma.message.findMany({
          where: { sessionId: session.sessionId },
          orderBy: { timestamp: 'asc' },
          take: 10
        });

        const conversationContext = chatHistory
          .map(msg => `${msg.sender}: ${msg.message}`)
          .join('\n');

        const fullDescription = `
=== INFORMAZIONI CLIENTE ===
Nome: ${ticketData.name}
Contatto: ${ticketData.contact.email || ticketData.contact.phone}
Metodo preferito: ${ticketData.contact.method}

=== RICHIESTA ===
${ticketData.additionalInfo || 'Nessuna informazione aggiuntiva fornita'}

=== STORICO CONVERSAZIONE ===
${conversationContext}
        `.trim();

        const ticket = await prisma.ticket.create({
          data: {
            sessionId: session.sessionId,
            subject: `Supporto da ${ticketData.name} - ${session.sessionId.substring(0, 8)}`,
            description: fullDescription,
            userEmail: ticketData.contact.email,
            userPhone: ticketData.contact.phone,
            contactMethod: ticketData.contact.method,
            priority: PRIORITY.MEDIUM,
            status: 'OPEN'
            // resumeToken and resumeUrl are auto-generated by Prisma (default: cuid())
          }
        });

        // Generate resume URL
        const baseUrl = process.env.CHAT_WIDGET_URL || 'https://lucinedinatale.it';
        const resumeUrl = `${baseUrl}?ticket=${ticket.resumeToken}`;

        // Update ticket with resume URL
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { resumeUrl }
        });

        // Log analytics
        await prisma.analytics.create({
          data: {
            eventType: ANALYTICS.EVENT_TYPES.TICKET_FROM_CHAT,
            sessionId: session.sessionId,
            eventData: {
              ticketId: ticket.id,
              ticketNumber: ticket.ticketNumber,
              contactMethod: ticketData.contact.method,
              hasAdditionalInfo: !!ticketData.additionalInfo
            }
          }
        });

        // Reset session status and clear ticket data
        await prisma.chatSession.update({
          where: { id: session.id },
          data: {
            status: SESSION_STATUS.ACTIVE,
            metadata: null
          }
        });

        return res.json({
          reply: `✅ **Ticket #${ticket.ticketNumber} creato con successo!**\n\n👤 **${ticketData.name}**, grazie per le informazioni!\n\n📧 Ti contatteremo a: **${ticketData.contact.email || ticketData.contact.phone}**\n⏱️ **Tempo di risposta**: 2-4 ore\n\n🔗 **Link per riprendere la chat**:\n${resumeUrl}\n\n💡 _Salva questo link! Potrai usarlo per continuare la conversazione in qualsiasi momento._\n\nGrazie per aver contattato le **Lucine di Natale**! 🎄✨`,
          sessionId: session.sessionId,
          status: 'ticket_created',
          ticketNumber: ticket.ticketNumber,
          resumeUrl,
          smartActions: [
            {
              type: 'success',
              icon: '✅',
              text: `Ticket #${ticket.ticketNumber}`,
              description: 'Creato con successo'
            },
            {
              type: 'secondary',
              icon: '💬',
              text: 'Nuova Conversazione',
              description: 'Continua a chattare con Lucy',
              action: 'continue_ai'
            }
          ]
        });
      } catch (error) {
        console.error('❌ Error creating ticket:', error);
        throw error;
      }
    }

  } catch (error) {
    console.error('❌ Ticket collection error:', error);
    return res.status(500).json({
      error: 'Errore nella raccolta dati ticket',
      sessionId: session.sessionId
    });
  }
}

export default { handleTicketCollection };
