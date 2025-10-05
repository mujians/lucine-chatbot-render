/**
 * 📝 Structured Logger
 * Replaces console.log with proper structured logging
 * Supports log levels: DEBUG, INFO, WARN, ERROR
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

class Logger {
  constructor() {
    // Default to INFO in production, DEBUG in development
    this.level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG');
    this.minLevel = LOG_LEVELS[this.level] || LOG_LEVELS.INFO;
  }

  /**
   * Format log message with metadata
   * @param {string} level - Log level
   * @param {string} context - Log context (e.g., 'AUTH', 'QUEUE', 'CHAT')
   * @param {string} message - Human-readable message
   * @param {object} data - Additional data to log
   * @returns {object} Formatted log object
   */
  formatMessage(level, context, message, data = {}) {
    const logObject = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      ...data
    };

    // Add environment info in development
    if (process.env.NODE_ENV !== 'production') {
      logObject.env = 'development';
    }

    return logObject;
  }

  /**
   * Check if log level should be output
   * @param {string} level - Log level to check
   * @returns {boolean} True if should log
   */
  shouldLog(level) {
    return LOG_LEVELS[level] >= this.minLevel;
  }

  /**
   * Debug level logging (only in development)
   * @param {string} context - Log context
   * @param {string} message - Message
   * @param {object} data - Additional data
   */
  debug(context, message, data = {}) {
    if (this.shouldLog('DEBUG')) {
      const formatted = this.formatMessage('DEBUG', context, message, data);
      console.log('🐛 DEBUG', JSON.stringify(formatted, null, 2));
    }
  }

  /**
   * Info level logging
   * @param {string} context - Log context
   * @param {string} message - Message
   * @param {object} data - Additional data
   */
  info(context, message, data = {}) {
    if (this.shouldLog('INFO')) {
      const formatted = this.formatMessage('INFO', context, message, data);
      console.log('ℹ️  INFO', JSON.stringify(formatted, null, 2));
    }
  }

  /**
   * Warning level logging
   * @param {string} context - Log context
   * @param {string} message - Message
   * @param {object} data - Additional data
   */
  warn(context, message, data = {}) {
    if (this.shouldLog('WARN')) {
      const formatted = this.formatMessage('WARN', context, message, data);
      console.warn('⚠️  WARN', JSON.stringify(formatted, null, 2));
    }
  }

  /**
   * Error level logging
   * @param {string} context - Log context
   * @param {string} message - Message
   * @param {Error|null} error - Error object
   */
  error(context, message, error = null) {
    if (this.shouldLog('ERROR')) {
      const formatted = this.formatMessage('ERROR', context, message, {
        error: error ? {
          message: error.message,
          stack: error.stack,
          code: error.code
        } : null
      });
      console.error('❌ ERROR', JSON.stringify(formatted, null, 2));
    }
  }

  // ==========================================
  // Convenience methods for common contexts
  // ==========================================

  /**
   * Authentication logging helpers
   */
  auth = {
    login: (username, success, data = {}) => {
      if (success) {
        this.info('AUTH', `Login successful`, { username, ...data });
      } else {
        this.warn('AUTH', `Login failed`, { username, ...data });
      }
    },
    logout: (operatorId, data = {}) => {
      this.info('AUTH', 'Logout', { operatorId, ...data });
    },
    autoAssign: (operatorId, sessionId) => {
      this.info('AUTH', 'Auto-assigned to queue', { operatorId, sessionId });
    },
    adminCreated: () => {
      this.info('AUTH', 'Admin operator auto-created');
    }
  };

  /**
   * Queue logging helpers
   */
  queue = {
    added: (sessionId, priority, data = {}) => {
      this.info('QUEUE', 'Session added to queue', { sessionId, priority, ...data });
    },
    assigned: (sessionId, operatorId, data = {}) => {
      this.info('QUEUE', 'Chat assigned to operator', { sessionId, operatorId, ...data });
    },
    removed: (sessionId, reason) => {
      this.info('QUEUE', 'Session removed from queue', { sessionId, reason });
    },
    updated: (sessionId, newPosition) => {
      this.debug('QUEUE', 'Queue position updated', { sessionId, newPosition });
    }
  };

  /**
   * Chat session logging helpers
   */
  chat = {
    created: (sessionId, data = {}) => {
      this.info('CHAT', 'Session created', { sessionId, ...data });
    },
    escalated: (sessionId, operatorId) => {
      this.info('CHAT', 'Escalated to operator', { sessionId, operatorId });
    },
    ended: (sessionId, reason) => {
      this.info('CHAT', 'Chat ended', { sessionId, reason });
    },
    message: (sessionId, sender, messageLength) => {
      this.debug('CHAT', 'Message sent', { sessionId, sender, messageLength });
    }
  };

  /**
   * Ticket logging helpers
   */
  ticket = {
    created: (ticketNumber, sessionId, data = {}) => {
      this.info('TICKET', 'Ticket created', { ticketNumber, sessionId, ...data });
    },
    updated: (ticketNumber, status) => {
      this.info('TICKET', 'Ticket updated', { ticketNumber, status });
    },
    resumed: (ticketNumber, sessionId) => {
      this.info('TICKET', 'Ticket resumed', { ticketNumber, sessionId });
    }
  };

  /**
   * WebSocket logging helpers
   */
  websocket = {
    connected: (typeOrId, id) => {
      // Support both: connected('new_connection') and connected('operator', 'id123')
      if (id) {
        this.info('WEBSOCKET', `${typeOrId} connected`, { id });
      } else {
        this.info('WEBSOCKET', 'Connection established', { type: typeOrId });
      }
    },
    disconnected: (typeOrId, id, reason) => {
      // Support both: disconnected('operator_123') and disconnected('operator', 'id123', reason)
      if (id) {
        this.info('WEBSOCKET', `${typeOrId} disconnected`, { id, reason });
      } else {
        this.info('WEBSOCKET', 'Connection closed', { type: typeOrId });
      }
    },
    message: (type, event, data = {}) => {
      this.debug('WEBSOCKET', `${type} message: ${event}`, data);
    },
    error: (type, error) => {
      this.error('WEBSOCKET', `${type} error`, error);
    },
    sent: (sessionId, event, data = {}) => {
      this.debug('WEBSOCKET', `Message sent to ${sessionId}: ${event}`, data);
    }
  };

  /**
   * AI/OpenAI logging helpers
   */
  ai = {
    request: (sessionId, messageLength) => {
      this.debug('AI', 'OpenAI request sent', { sessionId, messageLength });
    },
    response: (sessionId, responseLength, escalation) => {
      this.debug('AI', 'OpenAI response received', { sessionId, responseLength, escalation });
    },
    error: (sessionId, error) => {
      this.error('AI', 'OpenAI error', error);
    }
  };

  /**
   * Database/Prisma logging helpers
   */
  db = {
    connected: () => {
      this.info('DATABASE', 'Database connected successfully');
    },
    query: (model, operation, data = {}) => {
      this.debug('DATABASE', `${model}.${operation}`, data);
    },
    error: (operation, error) => {
      this.error('DATABASE', `Error in ${operation}`, error);
    }
  };

  /**
   * Health check logging helpers
   */
  health = {
    started: () => {
      this.info('HEALTH', 'Health monitoring service started');
    },
    check: (metric, status, value) => {
      if (status === 'critical') {
        this.error('HEALTH', `Critical: ${metric}`, null);
      } else if (status === 'warning') {
        this.warn('HEALTH', `Warning: ${metric}`, { value });
      } else {
        this.debug('HEALTH', `OK: ${metric}`, { value });
      }
    },
    alert: (metric, message) => {
      this.error('HEALTH', `Alert: ${metric}`, { message });
    }
  };

  /**
   * SLA logging helpers
   */
  sla = {
    created: (entityId, priority, entityType = 'SESSION') => {
      this.info('SLA', 'SLA record created', { entityId, priority, entityType });
    },
    timeout: (sessionId, timeElapsed) => {
      this.warn('SLA', 'Session timeout', { sessionId, timeElapsed });
    },
    warning: (sessionId, timeRemaining) => {
      this.warn('SLA', 'SLA warning threshold', { sessionId, timeRemaining });
    },
    violation: (entityId, violationType, minutesLate) => {
      this.error('SLA', `SLA ${violationType} violation`, { entityId, minutesLate });
    }
  };
}

// Export singleton instance
export const logger = new Logger();
export default logger;
