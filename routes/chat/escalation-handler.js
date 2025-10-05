/**
 * ⚡ ESCALATION HANDLER
 * Gestisce l'escalation a operatori umani
 */

import container from '../../config/container.js';
import { notifyOperators } from '../../utils/notifications.js';
import { SESSION_STATUS, ANALYTICS } from '../../config/constants.js';
import { queueService } from '../../services/queue-service.js';
import { slaService } from '../../services/sla-service.js';
import { getAutomatedText } from '../../utils/automated-texts.js';
import { createEscalationActions, enrichSmartActions } from '../../utils/smart-actions.js';
import logger from '../../utils/logger.js';
import { OperatorRepository } from '../../utils/operator-repository.js';
import { calculatePriority, getMinutesWaiting } from '../../utils/priority-calculator.js';

/**
 * Gestisce richiesta escalation a operatore
 */
export async function handleEscalation(message, session) {
  const prisma = container.get('prisma');

  try {
    logger.debug('ESCALATION', 'Checking for operators');

    // Debug: Show ALL operators first
    const allOperators = await prisma.operator.findMany({
      select: {
        id: true,
        name: true,
        isOnline: true,
        isActive: true
      }
    });
    logger.debug('ESCALATION', 'All operators in database', { count: allOperators.length });

    // Check for online operators
    const onlineOperators = await prisma.operator.findMany({
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

    logger.info('ESCALATION', 'Online operators found', { count: onlineOperators.length });

    // ✅ FIX N+1 QUERY: Get all active chat counts in a single query
    let availableOperator = null;
    if (onlineOperators.length > 0) {
      // Extract operator IDs
      const operatorIds = onlineOperators.map(op => op.id);

      // Single query to get active chat counts for all operators
      const activeChatCounts = await prisma.operatorChat.groupBy({
        by: ['operatorId'],
        where: {
          operatorId: { in: operatorIds },
          endedAt: null
        },
        _count: {
          id: true
        }
      });

      // Create lookup map for O(1) access
      const chatCountMap = new Map(
        activeChatCounts.map(result => [result.operatorId, result._count.id])
      );

      // Find first operator with 0 active chats
      for (const operator of onlineOperators) {
        const activeChats = chatCountMap.get(operator.id) || 0;
        logger.debug('ESCALATION', 'Operator chat count', { operatorName: operator.name, activeChats });

        if (activeChats === 0) {
          availableOperator = operator;
          break;
        }
      }
    }

    const hasOnlineOperators = onlineOperators.length > 0;
    const hasAvailableOperator = availableOperator !== null;

    logger.info('ESCALATION', 'Operators summary', {
      onlineCount: onlineOperators.length,
      hasAvailable: hasAvailableOperator
    });

    if (hasAvailableOperator) {
      // Update session status
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { status: SESSION_STATUS.WITH_OPERATOR }
      });

      // Create operator chat
      const operatorChat = await prisma.operatorChat.create({
        data: {
          sessionId: session.sessionId,
          operatorId: availableOperator.id
        }
      });

      // 📊 Create SLA record for tracking response time (dynamic priority)
      const sessionAgeForSLA = Date.now() - new Date(session.createdAt).getTime();
      const minutesWaitingForSLA = Math.floor(sessionAgeForSLA / 60000);
      let slaPriority = 'LOW';
      if (minutesWaitingForSLA > 15) {
        slaPriority = 'HIGH';
      } else if (minutesWaitingForSLA > 5) {
        slaPriority = 'MEDIUM';
      }

      try {
        await slaService.createSLA(
          session.sessionId,
          'SESSION',
          slaPriority,
          'OPERATOR_ESCALATION'
        );
        logger.info('SLA', 'SLA record created for operator chat', { priority: slaPriority, sessionId: session.sessionId });
      } catch (error) {
        logger.error('SLA', 'Failed to create SLA record', error);
        // Non blocking - continue with escalation
      }

      // 🔔 Notify ALL operators about new request
      notifyOperators({
        event: 'new_operator_request',
        sessionId: session.sessionId,
        title: 'Nuova Richiesta Supporto',
        message: `Un cliente richiede assistenza: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`
      });

      // 🔔 Notify assigned operator specifically
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

      const operatorConnectedText = await getAutomatedText('operator_connected', {
        operatorName: availableOperator.name
      });

      return {
        success: true,
        reply: operatorConnectedText,
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
      logger.info('ESCALATION', 'No operators available - adding to queue', { sessionId: session.sessionId });

      // ✅ Calculate priority based on session wait time (centralized logic)
      const priority = calculatePriority(session.createdAt);
      const minutesWaiting = getMinutesWaiting(session.createdAt);

      logger.debug('QUEUE', 'Calculated priority', { sessionId: session.sessionId, minutesWaiting, priority });

      // 📋 Add to queue with dynamic priority
      let queueInfo = null;
      try {
        queueInfo = await queueService.addToQueue(
          session.sessionId,
          priority,
          [] // requiredSkills
        );
        logger.queue.added(session.sessionId, priority, queueInfo);
      } catch (error) {
        logger.error('QUEUE', 'Failed to add to queue', error);
        // Continue with fallback to ticket
      }

      // Update session status to WAITING_OPERATOR (not ticket)
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { status: SESSION_STATUS.WAITING_OPERATOR }
      });

      // 📊 Create SLA for queue waiting time (with dynamic priority)
      try {
        await slaService.createSLA(
          session.sessionId,
          'SESSION',
          priority, // Use calculated priority
          'QUEUE_WAITING'
        );
        logger.info('SLA', 'SLA record created for queue entry', { priority, sessionId: session.sessionId });
      } catch (error) {
        logger.error('SLA', 'Failed to create SLA for queue', error);
      }

      // Notify ALL operators that there's a new request waiting
      notifyOperators({
        event: 'new_operator_request',
        sessionId: session.sessionId,
        title: 'Nuova Richiesta Supporto',
        message: `Un cliente richiede assistenza: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`
      });

      // Log analytics
      await prisma.analytics.create({
        data: {
          eventType: ANALYTICS.EVENT_TYPES.ESCALATION_REQUEST,
          sessionId: session.sessionId,
          eventData: {
            result: 'no_operators_available',
            fallback: 'added_to_queue',
            queuePosition: queueInfo?.position,
            estimatedWait: queueInfo?.estimatedWait
          }
        }
      });

      // Different messages based on scenario
      let reply, smartActions;

      if (!hasOnlineOperators) {
        // SCENARIO 1: No operators online at all
        reply = await getAutomatedText('operator_no_online');
      } else {
        // SCENARIO 2: Operators online but all busy
        const waitMessage = queueInfo && queueInfo.estimatedWait
          ? `Attesa stimata: ~${queueInfo.estimatedWait} minuti`
          : 'Ti risponderemo al più presto';

        reply = await getAutomatedText('operator_all_busy', { waitMessage });
      }

      // Create context-aware smartActions using utility
      smartActions = enrichSmartActions(
        createEscalationActions(hasOnlineOperators, queueInfo),
        {
          sessionStatus: session.status,
          hasOnlineOperators,
          queuePosition: queueInfo?.position
        }
      );

      // Return queue info instead of immediate ticket
      return {
        success: false,
        reply,
        sessionId: session.sessionId,
        status: hasOnlineOperators ? 'waiting_in_queue' : 'no_operators_online',
        needsContact: false,
        queueId: queueInfo?.queueId,
        position: queueInfo?.position,
        estimatedWait: queueInfo?.estimatedWait,
        hasOnlineOperators,
        onlineOperatorsCount: onlineOperators.length,
        smartActions
      };
    }
  } catch (error) {
    logger.error('ESCALATION', 'Escalation error', error);
    throw error;
  }
}

export default { handleEscalation };
