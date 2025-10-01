/**
 * 🎯 CENTRALIZED CONSTANTS
 * Tutte le configurazioni e costanti del sistema in un unico posto
 */

// ⏱️ TIMEOUT & POLLING
export const TIMEOUT = {
  CHAT_INACTIVITY_MINUTES: 10,
  CHAT_ABANDONMENT_MINUTES: 30,
  POLL_INTERVAL_MS: 3000,
  API_REQUEST_TIMEOUT_MS: 5000,
  WEBSOCKET_RECONNECT_MS: 5000
};

// 🔢 RATE LIMITING
export const RATE_LIMIT = {
  WINDOW_MS: 60 * 1000, // 1 minute
  MAX_REQUESTS: 10,
  CHAT_MAX_REQUESTS: 20,
  LOGIN_MAX_REQUESTS: 5
};

// 💬 CHAT CONFIGURATION
export const CHAT = {
  MAX_MESSAGE_LENGTH: 1000,
  MAX_HISTORY_MESSAGES: 10,
  SESSION_ID_PREFIX: 'session-',
  AI_MODEL: 'gpt-3.5-turbo',
  AI_TEMPERATURE: 0.3,
  AI_MAX_TOKENS: 400
};

// 🎫 TICKET SYSTEM
export const TICKET = {
  PREFIX: 'TKT-',
  SLA_HOURS: {
    LOW: 24,
    MEDIUM: 4,
    HIGH: 2,
    URGENT: 1
  },
  AUTO_CLOSE_DAYS: 7
};

// 👥 OPERATOR SETTINGS
export const OPERATOR = {
  MAX_CONCURRENT_CHATS: 5,
  IDLE_TIMEOUT_MINUTES: 15,
  SESSION_EXPIRY_HOURS: 8
};

// 🔐 SECURITY
export const SECURITY = {
  JWT_EXPIRY: '8h',
  BCRYPT_SALT_ROUNDS: 12,
  SESSION_SECRET_MIN_LENGTH: 32,
  PASSWORD_MIN_LENGTH: 8
};

// 📊 ANALYTICS
export const ANALYTICS = {
  RETENTION_DAYS: 90,
  BATCH_SIZE: 100,
  EVENT_TYPES: {
    CHAT_MESSAGE: 'chat_message',
    ESCALATION_REQUEST: 'escalation_request',
    OPERATOR_CONNECTED: 'operator_connected',
    CHAT_RESOLVED: 'chat_resolved',
    CHAT_TIMEOUT: 'chat_timeout',
    CHAT_REACTIVATED: 'chat_reactivated',
    CHAT_ABANDONED: 'chat_abandoned',
    TICKET_CREATED: 'ticket_created',
    TICKET_FROM_CHAT: 'ticket_from_chat',
    TICKET_RESOLVED: 'ticket_resolved',
    INTERNAL_NOTE_ADDED: 'internal_note_added',
    CHAT_STATUS_CHANGED: 'chat_status_changed'
  }
};

// 📱 SESSION STATES
export const SESSION_STATUS = {
  ACTIVE: 'ACTIVE',
  IDLE: 'IDLE',
  ENDED: 'ENDED',
  WITH_OPERATOR: 'WITH_OPERATOR',
  RESOLVED: 'RESOLVED',
  NOT_RESOLVED: 'NOT_RESOLVED',
  WAITING_CLIENT: 'WAITING_CLIENT',
  CANCELLED: 'CANCELLED',
  REQUESTING_TICKET: 'REQUESTING_TICKET'
};

// 💬 MESSAGE TYPES
export const MESSAGE_SENDER = {
  USER: 'USER',
  BOT: 'BOT',
  OPERATOR: 'OPERATOR',
  SYSTEM: 'SYSTEM'
};

// 🎨 SMART ACTION TYPES
export const SMART_ACTION_TYPES = {
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  SUCCESS: 'success',
  INFO: 'info',
  WARNING: 'warning',
  DANGER: 'danger'
};

// 🌐 CORS ORIGINS
export const ALLOWED_ORIGINS = [
  'https://lucinedinatale.it',
  'https://lucine-chatbot.onrender.com',
  'http://localhost:3000',
  'http://localhost:8000'
];

// 📧 CONTACT METHODS
export const CONTACT_METHOD = {
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
  CHAT: 'CHAT',
  PHONE: 'PHONE'
};

// 🎯 PRIORITY LEVELS
export const PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT'
};

// 📝 REGEX PATTERNS
export const PATTERNS = {
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  PHONE_IT: /(?:\+39)?[\s]?([0-9]{10}|[0-9]{3}[\s]?[0-9]{3}[\s]?[0-9]{4})/,
  SESSION_ID: /^session-[0-9]+-[a-z0-9]+$/,
  TICKET_NUMBER: /^TKT-[0-9]{8}$/,

  // Escalation detection patterns
  UNKNOWN_RESPONSE: [
    /non ho informazioni specifiche/i,
    /mi dispiace.*non so/i,
    /non sono a conoscenza/i,
    /non conosco/i,
    /non posso rispondere/i,
    /vuoi parlare con un operatore/i
  ],

  OPERATOR_REQUEST: [
    /operatore/i,
    /assistenza umana/i,
    /parlare con persona/i,
    /voglio un operatore/i,
    /help/i,
    /assistenza/i,
    /supporto umano/i
  ]
};

// 🎄 KNOWLEDGE BASE PATHS
export const PATHS = {
  KNOWLEDGE_BASE: './data/knowledge-base.json',
  WHATSAPP_USERS: './data/whatsapp-users.json'
};

// 🔔 NOTIFICATION TYPES
export const NOTIFICATION_TYPES = {
  NEW_CHAT_ASSIGNED: 'new_chat_assigned',
  OPERATOR_MESSAGE: 'operator_message',
  CHAT_TIMEOUT: 'chat_timeout',
  TICKET_CREATED: 'ticket_created',
  SYSTEM_ALERT: 'system_alert'
};

// 📊 HEALTH CHECK
export const HEALTH = {
  CHECK_INTERVAL_MS: 60000, // 1 minute
  CRITICAL_THRESHOLDS: {
    RESPONSE_TIME_MS: 5000,
    ERROR_RATE_PERCENT: 5,
    CPU_PERCENT: 90,
    MEMORY_PERCENT: 90
  }
};

// 🎯 BUSINESS METRICS TARGETS
export const METRICS_TARGETS = {
  AI_RESOLUTION_RATE: 0.70, // 70%
  OPERATOR_RESPONSE_TIME_SEC: 30,
  TICKET_SLA_HOURS: 4,
  CHAT_ABANDONMENT_RATE: 0.10, // 10%
  SYSTEM_UPTIME: 0.999 // 99.9%
};

// 🔄 SERVICE INTERVALS
export const SERVICE_INTERVALS = {
  TIMEOUT_CHECK_MS: 60000, // 1 minute
  QUEUE_PROCESS_MS: 5000, // 5 seconds
  SLA_MONITOR_MS: 300000, // 5 minutes
  HEALTH_CHECK_MS: 60000, // 1 minute
  CLEANUP_OLD_SESSIONS_MS: 3600000 // 1 hour
};

export default {
  TIMEOUT,
  RATE_LIMIT,
  CHAT,
  TICKET,
  OPERATOR,
  SECURITY,
  ANALYTICS,
  SESSION_STATUS,
  MESSAGE_SENDER,
  SMART_ACTION_TYPES,
  ALLOWED_ORIGINS,
  CONTACT_METHOD,
  PRIORITY,
  PATTERNS,
  PATHS,
  NOTIFICATION_TYPES,
  HEALTH,
  METRICS_TARGETS,
  SERVICE_INTERVALS
};
