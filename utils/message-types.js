/**
 * 📨 MESSAGE TYPE SYSTEM
 * Centralizza la gestione dei tipi di messaggio per evitare duplicazioni e fuori contesto
 */

export const MESSAGE_TYPES = {
  USER: 'user',           // Messaggio utente normale
  AI: 'ai',              // Risposta AI
  OPERATOR: 'operator',   // Messaggio operatore
  SYSTEM: 'system',       // Messaggio di sistema (join/leave/closure)
  COMMAND: 'command'      // Comando interno (non visualizzato)
};

export const MESSAGE_CONTEXTS = {
  // System contexts
  OPERATOR_JOINED: 'operator_joined',
  OPERATOR_LEFT: 'operator_left',
  OPERATOR_GREETING: 'operator_greeting',
  SESSION_CLOSED: 'session_closed',
  SESSION_RESUMED: 'session_resumed',

  // Command contexts (non visualizzati)
  REQUEST_OPERATOR: 'request_operator',
  CONTINUE_CHAT: 'continue_chat',
  END_CHAT: 'end_chat',
  OPEN_TICKET: 'open_ticket',

  // AI contexts
  AI_RESPONSE: 'ai_response',
  AI_ESCALATION: 'ai_escalation',
  AI_NO_KNOWLEDGE: 'ai_no_knowledge',

  // User contexts
  USER_MESSAGE: 'user_message'
};

/**
 * Crea metadata strutturato per un messaggio
 */
export function createMessageMetadata({
  type,
  context,
  operatorId = null,
  isAutomatic = false,
  smartActions = null,
  displayContext = null,
  ...additionalData
}) {
  return {
    type,
    context,
    operatorId,
    isAutomatic,
    smartActions,
    displayContext,
    timestamp: new Date().toISOString(),
    ...additionalData
  };
}

/**
 * Verifica se un messaggio deve essere visualizzato
 */
export function shouldDisplayMessage(message) {
  // Non mostrare comandi interni
  if (message.metadata?.type === MESSAGE_TYPES.COMMAND) {
    return false;
  }

  // Non mostrare messaggi con context di comando
  const commandContexts = [
    MESSAGE_CONTEXTS.REQUEST_OPERATOR,
    MESSAGE_CONTEXTS.CONTINUE_CHAT,
    MESSAGE_CONTEXTS.END_CHAT,
    MESSAGE_CONTEXTS.OPEN_TICKET
  ];

  if (commandContexts.includes(message.metadata?.context)) {
    return false;
  }

  return true;
}

/**
 * Verifica se un messaggio è un duplicato
 */
export function isDuplicateMessage(message, existingMessages) {
  // Check by ID first
  if (existingMessages.some(m => m.id === message.id)) {
    return true;
  }

  // Check by content + timestamp for automatic messages
  if (message.metadata?.isAutomatic) {
    const sameContent = existingMessages.filter(m =>
      m.message === message.message &&
      m.metadata?.context === message.metadata?.context &&
      Math.abs(new Date(m.timestamp) - new Date(message.timestamp)) < 2000 // Within 2 seconds
    );

    if (sameContent.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Filtra messaggi per visualizzazione nel widget
 */
export function filterMessagesForDisplay(messages) {
  const displayedIds = new Set();

  return messages.filter(message => {
    // Skip if already displayed
    if (displayedIds.has(message.id)) {
      return false;
    }

    // Skip if shouldn't display
    if (!shouldDisplayMessage(message)) {
      return false;
    }

    displayedIds.add(message.id);
    return true;
  });
}

/**
 * Crea messaggio di sistema con metadata corretto
 */
export async function createSystemMessage(prisma, sessionId, text, context, additionalMetadata = {}) {
  return await prisma.message.create({
    data: {
      sessionId,
      sender: 'SYSTEM',
      message: text,
      metadata: createMessageMetadata({
        type: MESSAGE_TYPES.SYSTEM,
        context,
        ...additionalMetadata
      })
    }
  });
}

/**
 * Crea messaggio operatore con metadata corretto
 */
export async function createOperatorMessage(prisma, sessionId, text, operatorId, isAutomatic = false, context = null, additionalMetadata = {}) {
  return await prisma.message.create({
    data: {
      sessionId,
      sender: 'OPERATOR',
      message: text,
      metadata: createMessageMetadata({
        type: MESSAGE_TYPES.OPERATOR,
        context: context || (isAutomatic ? MESSAGE_CONTEXTS.OPERATOR_GREETING : null),
        operatorId,
        isAutomatic,
        ...additionalMetadata
      })
    }
  });
}

/**
 * Crea messaggio comando (interno, non visualizzato)
 */
export async function createCommandMessage(prisma, sessionId, command, context, metadata = {}) {
  return await prisma.message.create({
    data: {
      sessionId,
      sender: 'USER',
      message: command,
      metadata: createMessageMetadata({
        type: MESSAGE_TYPES.COMMAND,
        context,
        ...metadata
      })
    }
  });
}
