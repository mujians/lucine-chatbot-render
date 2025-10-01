/**
 * 💬 SESSION HANDLER
 * Gestisce sessioni chat e messaggi
 */

import container from '../../config/container.js';
import { SESSION_STATUS, MESSAGE_SENDER, CHAT } from '../../config/constants.js';

/**
 * Ottieni o crea sessione chat
 */
export async function getOrCreateSession(sessionId, requestMetadata = {}) {
  const prisma = container.get('prisma');

  let session = await prisma.chatSession.findUnique({
    where: { sessionId },
    include: {
      messages: {
        orderBy: { timestamp: 'desc' },
        take: CHAT.MAX_HISTORY_MESSAGES
      },
      operatorChats: {
        where: { endedAt: null }
      }
    }
  });

  if (!session) {
    session = await prisma.chatSession.create({
      data: {
        sessionId,
        userIp: requestMetadata.ip,
        userAgent: requestMetadata.userAgent
      },
      include: {
        messages: {
          orderBy: { timestamp: 'desc' },
          take: CHAT.MAX_HISTORY_MESSAGES
        },
        operatorChats: {
          where: { endedAt: null }
        }
      }
    });
    console.log('✅ New session created:', sessionId);
  }

  return session;
}

/**
 * Salva messaggio utente
 */
export async function saveUserMessage(sessionId, message) {
  const prisma = container.get('prisma');

  await Promise.all([
    // Save message
    prisma.message.create({
      data: {
        sessionId,
        sender: MESSAGE_SENDER.USER,
        message
      }
    }),
    // Update session last activity
    prisma.chatSession.update({
      where: { sessionId },
      data: { lastActivity: new Date() }
    })
  ]);

  console.log('💾 User message saved for session:', sessionId);
}

/**
 * Costruisci cronologia conversazione per AI
 */
export function buildConversationHistory(messages) {
  return messages
    .reverse()
    .slice(0, 5)
    .map(msg => ({
      role: msg.sender === MESSAGE_SENDER.USER ? 'user' : 'assistant',
      content: msg.message
    }));
}

/**
 * Controlla se sessione è con operatore
 */
export function isWithOperator(session) {
  return session.status === SESSION_STATUS.WITH_OPERATOR &&
         session.operatorChats.length > 0;
}

/**
 * Controlla se sessione è in raccolta ticket
 */
export function isRequestingTicket(session) {
  return session.status === SESSION_STATUS.REQUESTING_TICKET;
}

export default {
  getOrCreateSession,
  saveUserMessage,
  buildConversationHistory,
  isWithOperator,
  isRequestingTicket
};
