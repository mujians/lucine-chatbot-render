/**
 * 🎯 SMART ACTIONS VALIDATOR
 * Gestisce la visibilità delle smartActions in base allo stato della sessione
 */

import { SESSION_STATUS } from '../config/constants.js';

/**
 * Verifica se uno smartAction è valido per lo stato corrente della sessione
 */
export function isActionValidForSessionState(action, sessionStatus, hasOperator = false) {
  const actionType = action.action;

  switch (actionType) {
    case 'wait_in_queue':
      // Solo se in attesa e NON c'è operatore
      return sessionStatus === SESSION_STATUS.WAITING_OPERATOR && !hasOperator;

    case 'request_operator':
      // Solo se chat attiva o resumed, senza operatore
      return (sessionStatus === SESSION_STATUS.ACTIVE || sessionStatus === SESSION_STATUS.RESUMED) && !hasOperator;

    case 'request_ticket':
    case 'open_ticket':
      // Sempre disponibile tranne se già con operatore
      return !hasOperator && sessionStatus !== SESSION_STATUS.CLOSED;

    case 'continue_ai':
      // Sempre disponibile se sessione non chiusa
      return sessionStatus !== SESSION_STATUS.CLOSED;

    case 'continue_chat':
      // Solo se chat chiusa o resumed
      return sessionStatus === SESSION_STATUS.CLOSED || sessionStatus === SESSION_STATUS.RESUMED;

    case 'end_chat':
      // Solo se chat attiva o con operatore
      return sessionStatus === SESSION_STATUS.ACTIVE ||
             sessionStatus === SESSION_STATUS.WITH_OPERATOR ||
             sessionStatus === SESSION_STATUS.RESUMED;

    case 'resume_chat':
      // Solo se ha un resumeToken
      return sessionStatus === SESSION_STATUS.CLOSED;

    default:
      // Unknown action - show by default
      return true;
  }
}

/**
 * Filtra smartActions valide per lo stato corrente
 */
export function filterValidSmartActions(smartActions, sessionStatus, hasOperator = false) {
  if (!smartActions || !Array.isArray(smartActions)) {
    return [];
  }

  return smartActions.filter(action =>
    isActionValidForSessionState(action, sessionStatus, hasOperator)
  );
}

/**
 * Crea smartActions per escalation in base allo stato operatori
 */
export function createEscalationActions(hasOnlineOperators, queueInfo = null) {
  if (!hasOnlineOperators) {
    // SCENARIO 1: Nessun operatore online
    return [
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
    // SCENARIO 2: Operatori online ma occupati
    const waitMessage = queueInfo?.estimatedWait
      ? `Sei in coda (posizione ${queueInfo.position}°)`
      : 'Aspetta un operatore';

    return [
      {
        type: 'info',  // ✅ Changed from 'primary' to 'info'
        icon: '⏱️',
        text: waitMessage,  // ✅ Show queue position as title
        description: 'Rimani su questa pagina',  // ✅ Clear instruction
        disabled: true,  // ✅ Make it non-clickable (informational only)
        action: 'wait_in_queue'  // Keep for compatibility but disabled
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
}

/**
 * Crea smartActions per chiusura chat con check operatore
 */
export function createClosureActions(operatorStillPresent = false) {
  if (operatorStillPresent) {
    // Operatore ancora presente - continua con lui
    return [
      {
        type: 'primary',
        icon: '✅',
        text: 'Sì, continua',
        description: 'L\'operatore ti aiuterà',
        action: 'continue_chat'
      },
      {
        type: 'secondary',
        icon: '👋',
        text: 'No, chiudi',
        description: 'Termina la conversazione',
        action: 'end_chat'
      }
    ];
  } else {
    // Operatore non più presente - torna in coda o AI
    return [
      {
        type: 'primary',
        icon: '👤',
        text: 'Sì, chiama operatore',
        description: 'Richiedi un nuovo operatore',
        action: 'request_operator'
      },
      {
        type: 'secondary',
        icon: '🤖',
        text: 'Continua con AI',
        description: 'Torna all\'assistente',
        action: 'continue_ai'
      },
      {
        type: 'secondary',
        icon: '👋',
        text: 'No, chiudi',
        description: 'Termina la conversazione',
        action: 'end_chat'
      }
    ];
  }
}

/**
 * Aggiunge metadata agli smartActions per tracking
 */
export function enrichSmartActions(actions, metadata = {}) {
  return actions.map(action => ({
    ...action,
    metadata: {
      ...action.metadata,
      ...metadata,
      generatedAt: new Date().toISOString()
    }
  }));
}
