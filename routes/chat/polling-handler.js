/**
 * 📡 POLLING HANDLER
 * Gestisce polling messaggi operatore
 */

import container from '../../config/container.js';
import { MESSAGE_SENDER, SESSION_STATUS } from '../../config/constants.js';
import { queueService } from '../../services/queue-service.js';
import { filterMessagesForDisplay } from '../../utils/message-types.js';
import { filterValidSmartActions } from '../../utils/smart-actions.js';

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
    // Filter out command messages and duplicates
    const displayableMessages = filterMessagesForDisplay(session.messages);

    const hasOperator = activeOperatorChat !== null;

    const operatorMessages = displayableMessages.map(msg => {
      const messageData = {
        id: msg.id,
        sender: msg.sender,
        message: msg.message,
        timestamp: msg.timestamp,
        metadata: msg.metadata // Include full metadata for client-side filtering
        // No operatorName - widget shows message directly without prefix
      };

      // Include smartActions if present in metadata, but filter by session state
      if (msg.metadata && msg.metadata.smartActions) {
        const validActions = filterValidSmartActions(
          msg.metadata.smartActions,
          session.status,
          hasOperator
        );

        if (validActions.length > 0) {
          messageData.smartActions = validActions;
        }
      }

      return messageData;
    });

    return {
      status: 'with_operator',
      sessionId,
      operatorId: activeOperatorChat.operatorId,
      // No operatorName in response - widget doesn't need it
      messages: operatorMessages
    };

  } catch (error) {
    console.error('❌ Polling error:', error);
    throw error;
  }
}

export default { handlePolling };
