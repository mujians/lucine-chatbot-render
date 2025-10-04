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

    console.log('🎯 Online operators found:', onlineOperators.length);

    // Find operators not currently in active chats
    let availableOperator = null;
    if (onlineOperators.length > 0) {
      for (const operator of onlineOperators) {
        const activeChats = await prisma.operatorChat.count({
          where: {
            operatorId: operator.id,
            endedAt: null // Still active
          }
        });

        console.log(`👤 Operator ${operator.name}: ${activeChats} active chats`);

        if (activeChats === 0) {
          availableOperator = operator;
          break;
        }
      }
    }

    const hasOnlineOperators = onlineOperators.length > 0;
    const hasAvailableOperator = availableOperator !== null;

    console.log(`📊 Summary: ${onlineOperators.length} online, ${hasAvailableOperator ? 'available' : 'all busy'}`);

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
        console.log(`✅ SLA record created for operator chat (priority: ${slaPriority})`);
      } catch (error) {
        console.error('⚠️ Failed to create SLA record:', error);
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
      console.log('❌ NO OPERATORS AVAILABLE - Adding to queue');

      // 📊 Calculate priority based on session wait time
      const sessionAge = Date.now() - new Date(session.createdAt).getTime();
      const minutesWaiting = Math.floor(sessionAge / 60000);

      let priority = 'LOW';
      if (minutesWaiting > 15) {
        priority = 'HIGH';
      } else if (minutesWaiting > 5) {
        priority = 'MEDIUM';
      }

      console.log(`📊 Session age: ${minutesWaiting} min → Priority: ${priority}`);

      // 📋 Add to queue with dynamic priority
      let queueInfo = null;
      try {
        queueInfo = await queueService.addToQueue(
          session.sessionId,
          priority,
          [] // requiredSkills
        );
        console.log('✅ Session added to queue:', queueInfo);
      } catch (error) {
        console.error('⚠️ Failed to add to queue:', error);
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
        console.log(`✅ SLA record created for queue entry (priority: ${priority})`);
      } catch (error) {
        console.error('⚠️ Failed to create SLA for queue:', error);
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

        smartActions = [
          {
            type: 'primary',
            icon: '🎫',
            text: 'Apri Ticket',
            description: 'Lascia il tuo contatto per assistenza',
            action: 'request_ticket'
          },
          {
            type: 'secondary',
            icon: '🤖',
            text: 'Continua con AI',
            description: 'Torna all\'assistente automatico',
            action: 'continue_ai'
          }
        ];
      } else {
        // SCENARIO 2: Operators online but all busy
        const waitMessage = queueInfo && queueInfo.estimatedWait
          ? `Attesa stimata: ~${queueInfo.estimatedWait} minuti`
          : 'Ti risponderemo al più presto';

        reply = await getAutomatedText('operator_all_busy', { waitMessage });

        smartActions = [
          {
            type: 'primary',
            icon: '⏱️',
            text: 'Attendi in linea',
            description: queueInfo ? `Sei in coda (posizione ${queueInfo.position}°)` : 'Aspetta un operatore'
          },
          {
            type: 'secondary',
            icon: '🎫',
            text: 'Apri Ticket',
            description: 'Assistenza via email/WhatsApp',
            action: 'request_ticket'
          },
          {
            type: 'secondary',
            icon: '🤖',
            text: 'Continua con AI',
            description: 'Torna all\'assistente automatico',
            action: 'continue_ai'
          }
        ];
      }

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
    console.error('❌ Escalation error:', error);
    throw error;
  }
}

export default { handleEscalation };
