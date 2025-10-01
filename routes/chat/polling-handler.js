/**
 * 📡 POLLING HANDLER
 * Gestisce polling messaggi operatore
 */

import container from '../../config/container.js';
import { MESSAGE_SENDER, SESSION_STATUS } from '../../config/constants.js';
import { queueService } from '../../services/queue-service.js';

/**
 * Polling endpoint per ricevere messaggi da operatore
 */
export async function handlePolling(sessionId) {
  const prisma = container.get('prisma');

  try {
    // Find session and check if it has an active operator chat
    const session = await prisma.chatSession.findUnique({
      where: { sessionId },
      include: {
        operatorChats: {
          where: { endedAt: null },
          include: {
            operator: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        messages: {
          where: {
            sender: {
              in: [MESSAGE_SENDER.OPERATOR, MESSAGE_SENDER.SYSTEM]
            }
          },
          orderBy: { timestamp: 'desc' },
          take: 10
        }
      }
    });

    if (!session) {
      return {
        error: 'Session not found',
        sessionId
      };
    }

    // Check if there's an active operator chat
    const activeOperatorChat = session.operatorChats[0];

    if (!activeOperatorChat) {
      // Check if session is waiting in queue
      let queueInfo = null;
      if (session.status === SESSION_STATUS.WAITING_OPERATOR) {
        try {
          const position = await queueService.getQueuePosition(sessionId);
          if (position) {
            const queueStats = await queueService.getQueueStats();
            queueInfo = {
              position,
              estimatedWait: Math.round(queueStats.avgWaitTime || 5) // minutes
            };
          }
        } catch (error) {
          console.error('⚠️ Failed to get queue info for polling:', error);
        }
      }

      return {
        status: session.status === SESSION_STATUS.WAITING_OPERATOR ? 'waiting_in_queue' : 'no_operator',
        sessionId,
        messages: [],
        queueInfo // Include queue position and wait time
      };
    }

    // Get new messages since last poll (messages not yet received by user)
    // For simplicity, we return last 10 operator messages
    const operatorMessages = session.messages.map(msg => ({
      id: msg.id,
      sender: msg.sender,
      message: msg.message,
      timestamp: msg.timestamp,
      operatorName: activeOperatorChat.operator?.name
    }));

    return {
      status: 'with_operator',
      sessionId,
      operatorId: activeOperatorChat.operatorId,
      operatorName: activeOperatorChat.operator?.name,
      messages: operatorMessages
    };

  } catch (error) {
    console.error('❌ Polling error:', error);
    throw error;
  }
}

export default { handlePolling };
