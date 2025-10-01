/**
 * ⚡ ESCALATION HANDLER
 * Gestisce l'escalation a operatori umani
 */

import container from '../../config/container.js';
import { notifyOperators } from '../../utils/notifications.js';
import { SESSION_STATUS, ANALYTICS } from '../../config/constants.js';

/**
 * Gestisce richiesta escalation a operatore
 */
export async function handleEscalation(message, session) {
  const prisma = container.get('prisma');

  try {
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

    // Check operator availability
    const availableOperator = await prisma.operator.findFirst({
      where: {
        isOnline: true,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        isOnline: true,
        isActive: true
      }
    });

    console.log('🎯 Available operator found:', availableOperator);

    if (availableOperator) {
      // Update session status
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { status: SESSION_STATUS.WITH_OPERATOR }
      });

      // Create operator chat
      await prisma.operatorChat.create({
        data: {
          sessionId: session.sessionId,
          operatorId: availableOperator.id
        }
      });

      // 🔔 Notify operator of new chat assignment
      notifyOperators({
        event: 'new_chat_assigned',
        sessionId: session.sessionId,
        userMessage: message,
        operator: {
          id: availableOperator.id,
          name: availableOperator.name
        },
        title: 'Nuova Chat Assegnata',
        message: `Chat dal cliente: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`
      }, availableOperator.id);

      // Log analytics
      await prisma.analytics.create({
        data: {
          eventType: ANALYTICS.EVENT_TYPES.OPERATOR_CONNECTED,
          sessionId: session.sessionId,
          eventData: {
            operatorId: availableOperator.id,
            operatorName: availableOperator.name,
            trigger: 'escalation_request'
          }
        }
      });

      return {
        success: true,
        reply: `🟢 Ti sto connettendo con ${availableOperator.name}...\n\n👤 Ti risponderò personalmente per aiutarti!`,
        sessionId: session.sessionId,
        status: 'connecting_operator',
        operator: {
          id: availableOperator.id,
          name: availableOperator.name,
          displayName: availableOperator.name,
          avatar: '👤'
        }
      };
    } else {
      console.log('❌ NO OPERATORS AVAILABLE - Offering ticket');

      // Update session to track that we're in ticket flow
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { status: SESSION_STATUS.REQUESTING_TICKET }
      });

      // Log analytics
      await prisma.analytics.create({
        data: {
          eventType: ANALYTICS.EVENT_TYPES.ESCALATION_REQUEST,
          sessionId: session.sessionId,
          eventData: {
            result: 'no_operators_available',
            fallback: 'ticket_creation'
          }
        }
      });

      // No operators available - offer ticket
      return {
        success: false,
        reply: `⏰ **Al momento tutti i nostri operatori sono offline**\n\n🎫 Posso creare un **ticket di supporto** per te:\n📧 **Email**: Risposta in 2-4 ore\n📱 **WhatsApp**: Risposta più rapida\n\n**Per continuare, scrivi il tuo contatto:**\n✉️ Esempio: mario@email.com\n📲 Esempio: +39 123 456 7890`,
        sessionId: session.sessionId,
        status: 'ticket_collection',
        needsContact: true,
        smartActions: [
          {
            type: 'info',
            icon: '📝',
            text: 'Come funziona',
            description: 'Ticket creato automaticamente'
          },
          {
            type: 'secondary',
            icon: '🔙',
            text: 'Torna alla Chat',
            description: 'Continua con assistente AI',
            action: 'continue_ai'
          }
        ]
      };
    }
  } catch (error) {
    console.error('❌ Escalation error:', error);
    throw error;
  }
}

export default { handleEscalation };
