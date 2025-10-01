/**
 * 🔐 SECURITY UTILITIES
 * Input validation, sanitization e session management sicuro
 */

import crypto from 'crypto';
import { CHAT, PATTERNS } from '../config/constants.js';

/**
 * Genera session ID sicuro (server-side)
 */
export function generateSecureSessionId() {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHash('sha256')
    .update(`${timestamp}-${randomBytes}-${process.env.JWT_SECRET}`)
    .digest('hex')
    .substring(0, 32);

  return `session-${timestamp}-${hash}`;
}

/**
 * Valida session ID format
 */
export function isValidSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return false;
  }

  // Check format: session-{timestamp}-{hash}
  const parts = sessionId.split('-');
  if (parts.length !== 3 || parts[0] !== 'session') {
    return false;
  }

  const timestamp = parseInt(parts[1]);
  const hash = parts[2];

  // Check timestamp is valid number
  if (isNaN(timestamp)) {
    return false;
  }

  // Check hash format (32 hex chars)
  if (!/^[a-f0-9]{32}$/i.test(hash)) {
    return false;
  }

  // Check timestamp not too old (max 7 days)
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - timestamp > maxAge) {
    return false;
  }

  return true;
}

/**
 * Sanitizza input testuale
 */
export function sanitizeText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove script tags content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove event handlers
    .replace(/on\w+\s*=\s*["']?[^"']*["']?/gi, '')
    // Remove javascript: protocol
    .replace(/javascript:/gi, '')
    // Trim whitespace
    .trim()
    // Limit length
    .substring(0, CHAT.MAX_MESSAGE_LENGTH);
}

/**
 * Valida e sanitizza messaggio chat
 */
export function validateChatMessage(message) {
  const errors = [];

  if (!message) {
    errors.push('Message is required');
  }

  if (typeof message !== 'string') {
    errors.push('Message must be a string');
  }

  if (message && message.length > CHAT.MAX_MESSAGE_LENGTH) {
    errors.push(`Message too long (max ${CHAT.MAX_MESSAGE_LENGTH} characters)`);
  }

  if (message && message.trim().length === 0) {
    errors.push('Message cannot be empty');
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /onerror=/i,
    /onclick=/i,
    /eval\(/i,
    /document\./i,
    /window\./i
  ];

  if (message && suspiciousPatterns.some(pattern => pattern.test(message))) {
    errors.push('Message contains suspicious content');
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: sanitizeText(message)
  };
}

/**
 * Valida email
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  return PATTERNS.EMAIL.test(email);
}

/**
 * Valida phone number italiano
 */
export function isValidPhoneIT(phone) {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  return PATTERNS.PHONE_IT.test(phone);
}

/**
 * Sanitizza email
 */
export function sanitizeEmail(email) {
  if (!email) return '';
  return email.toLowerCase().trim();
}

/**
 * Sanitizza phone
 */
export function sanitizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\s/g, '').replace(/^\+/, '');
}

/**
 * Rate limiting in-memory store (semplice)
 */
class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  isRateLimited(identifier) {
    const now = Date.now();
    const userRequests = this.requests.get(identifier) || [];

    // Remove old requests outside window
    const validRequests = userRequests.filter(
      timestamp => now - timestamp < this.windowMs
    );

    if (validRequests.length >= this.maxRequests) {
      return true;
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);

    return false;
  }

  reset(identifier) {
    this.requests.delete(identifier);
  }

  cleanup() {
    // Periodic cleanup of old entries
    const now = Date.now();
    for (const [identifier, requests] of this.requests.entries()) {
      const validRequests = requests.filter(
        timestamp => now - timestamp < this.windowMs
      );
      if (validRequests.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, validRequests);
      }
    }
  }
}

// Global rate limiter instances
export const chatRateLimiter = new RateLimiter(20, 60000); // 20 req/min
export const loginRateLimiter = new RateLimiter(5, 300000); // 5 req/5min

// Cleanup every minute
setInterval(() => {
  chatRateLimiter.cleanup();
  loginRateLimiter.cleanup();
}, 60000);

/**
 * Hash password helper
 */
export function hashPassword(password) {
  return crypto
    .createHash('sha256')
    .update(password + process.env.JWT_SECRET)
    .digest('hex');
}

/**
 * Compare password helper
 */
export function comparePassword(password, hash) {
  return hashPassword(password) === hash;
}

export default {
  generateSecureSessionId,
  isValidSessionId,
  sanitizeText,
  validateChatMessage,
  isValidEmail,
  isValidPhoneIT,
  sanitizeEmail,
  sanitizePhone,
  chatRateLimiter,
  loginRateLimiter,
  hashPassword,
  comparePassword
};
