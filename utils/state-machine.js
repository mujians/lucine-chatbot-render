/**
 * 🔄 CHAT STATE MACHINE
 * Gestisce transizioni di stato per sessioni chat
 */

import { SESSION_STATUS } from '../config/constants.js';

/**
 * Definizione stati e transizioni valide
 */
const STATE_TRANSITIONS = {
  [SESSION_STATUS.ACTIVE]: [
    SESSION_STATUS.WITH_OPERATOR,
    SESSION_STATUS.REQUESTING_TICKET,
    SESSION_STATUS.WAITING_CLIENT,
    SESSION_STATUS.ENDED
  ],
  [SESSION_STATUS.WITH_OPERATOR]: [
    SESSION_STATUS.RESOLVED,
    SESSION_STATUS.NOT_RESOLVED,
    SESSION_STATUS.WAITING_CLIENT,
    SESSION_STATUS.CANCELLED
  ],
  [SESSION_STATUS.WAITING_CLIENT]: [
    SESSION_STATUS.ACTIVE,
    SESSION_STATUS.WITH_OPERATOR,
    SESSION_STATUS.ENDED
  ],
  [SESSION_STATUS.REQUESTING_TICKET]: [
    SESSION_STATUS.ACTIVE,
    SESSION_STATUS.RESOLVED
  ],
  [SESSION_STATUS.RESOLVED]: [],
  [SESSION_STATUS.NOT_RESOLVED]: [
    SESSION_STATUS.WITH_OPERATOR,
    SESSION_STATUS.REQUESTING_TICKET
  ],
  [SESSION_STATUS.CANCELLED]: [],
  [SESSION_STATUS.ENDED]: []
};

/**
 * Chat State Machine Class
 */
export class ChatStateMachine {
  constructor(initialState = SESSION_STATUS.ACTIVE) {
    this.currentState = initialState;
    this.stateHistory = [{ state: initialState, timestamp: new Date() }];
  }

  /**
   * Verifica se transizione è valida
   */
  canTransitionTo(newState) {
    const allowedStates = STATE_TRANSITIONS[this.currentState];
    return allowedStates && allowedStates.includes(newState);
  }

  /**
   * Esegui transizione di stato
   */
  transition(newState, metadata = {}) {
    if (!this.canTransitionTo(newState)) {
      throw new Error(
        `Invalid state transition from ${this.currentState} to ${newState}`
      );
    }

    const previousState = this.currentState;
    this.currentState = newState;

    // Registra nella cronologia
    this.stateHistory.push({
      state: newState,
      previousState,
      timestamp: new Date(),
      metadata
    });

    console.log(`🔄 State transition: ${previousState} → ${newState}`, metadata);

    return {
      success: true,
      previousState,
      currentState: this.currentState
    };
  }

  /**
   * Ottieni stato corrente
   */
  getState() {
    return this.currentState;
  }

  /**
   * Ottieni cronologia stati
   */
  getHistory() {
    return this.stateHistory;
  }

  /**
   * Reset a stato iniziale
   */
  reset() {
    this.currentState = SESSION_STATUS.ACTIVE;
    this.stateHistory = [{ state: SESSION_STATUS.ACTIVE, timestamp: new Date() }];
  }

  /**
   * Stati terminali (non possono transizionare)
   */
  static isTerminalState(state) {
    return [
      SESSION_STATUS.RESOLVED,
      SESSION_STATUS.CANCELLED,
      SESSION_STATUS.ENDED
    ].includes(state);
  }

  /**
   * Stati attivi (richiedono monitoraggio)
   */
  static isActiveState(state) {
    return [
      SESSION_STATUS.ACTIVE,
      SESSION_STATUS.WITH_OPERATOR,
      SESSION_STATUS.REQUESTING_TICKET
    ].includes(state);
  }

  /**
   * Stati waiting (possono essere riattivati)
   */
  static isWaitingState(state) {
    return state === SESSION_STATUS.WAITING_CLIENT;
  }
}

/**
 * Helper per validare transizione senza istanziare classe
 */
export function isValidTransition(fromState, toState) {
  const allowedStates = STATE_TRANSITIONS[fromState];
  return allowedStates && allowedStates.includes(toState);
}

/**
 * Ottieni stati raggiungibili da stato corrente
 */
export function getReachableStates(currentState) {
  return STATE_TRANSITIONS[currentState] || [];
}

/**
 * Genera diagramma stati (per debug)
 */
export function getStateDiagram() {
  const diagram = [];
  for (const [fromState, toStates] of Object.entries(STATE_TRANSITIONS)) {
    if (toStates.length > 0) {
      diagram.push(`${fromState} → ${toStates.join(', ')}`);
    } else {
      diagram.push(`${fromState} → [TERMINAL]`);
    }
  }
  return diagram.join('\n');
}

export default {
  ChatStateMachine,
  isValidTransition,
  getReachableStates,
  getStateDiagram
};
