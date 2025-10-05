/**
 * 🎫 TICKET COLLECTION HANDLER
 * Gestisce la raccolta dati per creazione ticket quando operatori offline
 */

import container from '../../config/container.js';
import { PATTERNS, CONTACT_METHOD, PRIORITY, SESSION_STATUS, ANALYTICS } from '../../config/constants.js';
import { getAutomatedText } from '../../utils/automated-texts.js';
import { twilioService } from '../../services/twilio-service.js';

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

      const cancelText = await getAutomatedText('ticket_cancel');

      return res.json({
        reply: cancelText,
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

        const askContactText = await getAutomatedText('ticket_ask_contact', { name: ticketData.name });

        return res.json({
          reply: askContactText,
          sessionId: session.sessionId,
          status: 'collecting_contact'
        });
      } else {
        const invalidNameText = await getAutomatedText('ticket_name_invalid');

        return res.json({
          reply: invalidNameText,
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

        const askAdditionalText = await getAutomatedText('ticket_ask_additional', {
          contact: ticketData.contact.email || ticketData.contact.phone
        });

        return res.json({
          reply: askAdditionalText,
          sessionId: session.sessionId,
          status: 'collecting_additional_info'
        });
      } else {
        const invalidContactText = await getAutomatedText('ticket_contact_invalid');

        return res.json({
          reply: invalidContactText,
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

        // Send WhatsApp notification if user provided phone number
        if (ticketData.contact.phone && ticketData.contact.method === CONTACT_METHOD.WHATSAPP) {
          try {
            await twilioService.sendTicketResumeLink(
              ticketData.contact.phone,
              ticket.ticketNumber,
              resumeUrl,
              ticketData.name
            );
            console.log(`📱 WhatsApp resume link sent to ${ticketData.contact.phone}`);
          } catch (whatsappError) {
            console.error('❌ Failed to send WhatsApp notification:', whatsappError);
            // Non blocchiamo il flusso se l'invio fallisce
          }
        }

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
