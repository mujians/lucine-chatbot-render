/**
 * 🔔 NOTIFICATION UTILITIES
 * Gestione notifiche WebSocket agli operatori
 */

import container from '../config/container.js';

/**
 * Invia notifica a operatori via WebSocket
 * @param {Object} message - Messaggio da inviare
 * @param {string} targetOperatorId - ID operatore specifico (opzionale)
 */
export function notifyOperators(message, targetOperatorId = null) {
  const operatorConnections = container.get('operatorConnections');

  const notification = {
    type: 'notification',
    ...message,
    timestamp: new Date().toISOString()
  };

  if (targetOperatorId && operatorConnections.has(targetOperatorId)) {
    // Send to specific operator
    const ws = operatorConnections.get(targetOperatorId);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(notification));
      console.log(`🔔 Notification sent to operator ${targetOperatorId}`);
    }
  } else {
    // Broadcast to all connected operators
    let sentCount = 0;
    operatorConnections.forEach((ws, operatorId) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(notification));
        sentCount++;
      }
    });
    console.log(`📢 Notification broadcast to ${sentCount} operators`);
  }
}

/**
 * Controlla se un operatore è connesso via WebSocket
 */
export function isOperatorConnected(operatorId) {
  const operatorConnections = container.get('operatorConnections');
  return operatorConnections.has(operatorId);
}

/**
 * Ottieni tutti gli operatori connessi
 */
export function getConnectedOperators() {
  const operatorConnections = container.get('operatorConnections');
  return Array.from(operatorConnections.keys());
}

export default {
  notifyOperators,
  isOperatorConnected,
  getConnectedOperators
};
