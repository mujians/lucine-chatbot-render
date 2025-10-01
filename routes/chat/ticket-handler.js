/**
 * 🎫 TICKET COLLECTION HANDLER
 * Gestisce la raccolta dati per creazione ticket quando operatori offline
 */

import container from '../../config/container.js';
import { PATTERNS, CONTACT_METHOD, PRIORITY, SESSION_STATUS, ANALYTICS } from '../../config/constants.js';

/**
 * Gestisce il flusso di raccolta contatti per ticket creation
 */
export async function handleTicketCollection(message, session, res) {
  const prisma = container.get('prisma');

  try {
    // Analizza il messaggio per estrarre contatti
    const emailMatch = message.match(PATTERNS.EMAIL);
    const phoneMatch = message.match(PATTERNS.PHONE_IT);

    if (emailMatch || phoneMatch) {
      // Contatto trovato - crea ticket
      const contactInfo = {
        email: emailMatch ? emailMatch[0] : null,
        phone: phoneMatch ? phoneMatch[1]?.replace(/\s/g, '') : null,
        method: emailMatch ? CONTACT_METHOD.EMAIL : CONTACT_METHOD.WHATSAPP
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
            priority: PRIORITY.MEDIUM,
            status: 'OPEN'
          }
        });

        // Log analytics
        await prisma.analytics.create({
          data: {
            eventType: ANALYTICS.EVENT_TYPES.TICKET_FROM_CHAT,
            sessionId: session.sessionId,
            eventData: {
              ticketId: ticket.id,
              ticketNumber: ticket.ticketNumber,
              contactMethod: contactInfo.method
            }
          }
        });

        // Reset session status
        await prisma.chatSession.update({
          where: { id: session.id },
          data: { status: SESSION_STATUS.ACTIVE }
        });

        return res.json({
          reply: `✅ **Ticket #${ticket.ticketNumber} creato!**\n\n📧 Ti contatteremo a: ${contactInfo.email || contactInfo.phone}\n⏱️ **Tempo di risposta**: 2-4 ore\n\nGrazie per aver contattato le Lucine di Natale! 🎄`,
          sessionId: session.sessionId,
          status: 'ticket_created',
          ticketNumber: ticket.ticketNumber,
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
              description: 'Continua a chattare con Lucy'
            }
          ]
        });
      } catch (error) {
        console.error('❌ Error creating ticket:', error);
        throw error;
      }
    }

    // Contatto non valido o errore - chiedi di nuovo
    if (message.toLowerCase().includes('torna') || message.toLowerCase().includes('annulla')) {
      // User wants to go back to AI chat
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { status: SESSION_STATUS.ACTIVE }
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
    console.error('❌ Ticket collection error:', error);
    return res.status(500).json({
      error: 'Errore nella raccolta dati ticket',
      sessionId: session.sessionId
    });
  }
}

export default { handleTicketCollection };
