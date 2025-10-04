/**
 * 🔗 RESUME CHAT HANDLER
 * Gestisce ripresa conversazione da token ticket
 */

import container from '../../config/container.js';
import { SESSION_STATUS } from '../../config/constants.js';

/**
 * Riprende una chat esistente da un token ticket
 * GET /chat/resume/:token
 */
export async function resumeChatFromToken(token) {
  const prisma = container.get('prisma');

  try {
    console.log('🔗 Attempting to resume chat with token:', token);

    // Find ticket by resumeToken
    const ticket = await prisma.ticket.findUnique({
      where: { resumeToken: token },
      include: {
        session: {
          include: {
            messages: {
              orderBy: { timestamp: 'asc' },
              take: 50 // Last 50 messages
            },
            operatorChats: {
              where: { endedAt: null },
              include: {
                operator: {
                  select: {
                    id: true,
                    name: true,
                    displayName: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!ticket) {
      return {
        error: 'Ticket non trovato',
        message: 'Il link che hai utilizzato non è valido o è scaduto.'
      };
    }

    if (!ticket.session) {
      return {
        error: 'Sessione non trovata',
        message: 'La conversazione associata a questo ticket non esiste più.'
      };
    }

    const session = ticket.session;

    console.log(`✅ Found ticket #${ticket.ticketNumber} for session ${session.sessionId}`);

    // Update session lastActivity
    await prisma.chatSession.update({
      where: { id: session.id },
      data: {
        lastActivity: new Date(),
        // Keep status as is (might be WITH_OPERATOR, WAITING_OPERATOR, etc.)
      }
    });

    // Check if there's an active operator chat
    const activeOperatorChat = session.operatorChats[0];

    return {
      success: true,
      sessionId: session.sessionId,
      ticketNumber: ticket.ticketNumber,
      status: session.status,
      messages: session.messages.map(msg => ({
        id: msg.id,
        sender: msg.sender,
        message: msg.message,
        timestamp: msg.timestamp
      })),
      operatorConnected: !!activeOperatorChat,
      operator: activeOperatorChat ? {
        id: activeOperatorChat.operator.id,
        name: activeOperatorChat.operator.displayName || activeOperatorChat.operator.name
      } : null,
      welcomeMessage: `🎫 **Benvenuto!**\n\nHai ripreso la conversazione del ticket #${ticket.ticketNumber}.\n\n${activeOperatorChat ? '🟢 Un operatore è già assegnato alla tua richiesta.' : '⏱️ Sei in attesa di un operatore.'}`
    };

  } catch (error) {
    console.error('❌ Error resuming chat from token:', error);
    throw error;
  }
}

export default { resumeChatFromToken };
