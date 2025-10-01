/**
 * ⚠️ CENTRALIZED ERROR HANDLER with RETRY LOGIC
 * Gestione errori e retry automatici
 */

/**
 * Retry configuration
 */
const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000
};

/**
 * Error types che supportano retry
 */
const RETRYABLE_ERRORS = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'NetworkError',
  'TimeoutError'
];

/**
 * Controlla se errore è retryable
 */
function isRetryableError(error) {
  if (!error) return false;

  // Check error code
  if (error.code && RETRYABLE_ERRORS.includes(error.code)) {
    return true;
  }

  // Check error name
  if (error.name && RETRYABLE_ERRORS.includes(error.name)) {
    return true;
  }

  // Check error message
  const message = error.message?.toLowerCase() || '';
  if (message.includes('timeout') || message.includes('network')) {
    return true;
  }

  return false;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper con exponential backoff
 */
export async function withRetry(fn, config = {}) {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError;
  let delay = retryConfig.delayMs;

  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${retryConfig.maxAttempts}`);
      return await fn();
    } catch (error) {
      lastError = error;

      // Non retry se errore non è retryable
      if (!isRetryableError(error)) {
        console.error(`❌ Non-retryable error:`, error.message);
        throw error;
      }

      // Non retry se è l'ultimo tentativo
      if (attempt === retryConfig.maxAttempts) {
        console.error(`❌ Max retry attempts reached (${retryConfig.maxAttempts})`);
        break;
      }

      // Wait con exponential backoff
      console.warn(`⚠️ Attempt ${attempt} failed, retrying in ${delay}ms...`, error.message);
      await sleep(delay);

      // Increase delay per prossimo tentativo
      delay = Math.min(
        delay * retryConfig.backoffMultiplier,
        retryConfig.maxDelayMs
      );
    }
  }

  // Throw last error se tutti i tentativi falliti
  throw lastError;
}

/**
 * Error types custom
 */
export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.statusCode = 400;
  }
}

export class NotFoundError extends Error {
  constructor(resource, id) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
    this.resource = resource;
    this.id = id;
    this.statusCode = 404;
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
  }
}

export class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
  }
}

export class DatabaseError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
    this.statusCode = 500;
  }
}

export class ExternalServiceError extends Error {
  constructor(service, message, originalError) {
    super(`${service} error: ${message}`);
    this.name = 'ExternalServiceError';
    this.service = service;
    this.originalError = originalError;
    this.statusCode = 503;
  }
}

/**
 * Format error response per API
 */
export function formatErrorResponse(error) {
  // Development: ritorna stack trace
  if (process.env.NODE_ENV === 'development') {
    return {
      error: error.name || 'Error',
      message: error.message,
      stack: error.stack,
      ...(error.field && { field: error.field }),
      ...(error.resource && { resource: error.resource }),
      ...(error.service && { service: error.service })
    };
  }

  // Production: nascondi dettagli interni
  const statusCode = error.statusCode || 500;
  const safeErrors = [
    ValidationError,
    NotFoundError,
    UnauthorizedError,
    RateLimitError
  ];

  const isSafeError = safeErrors.some(ErrorClass =>
    error instanceof ErrorClass
  );

  if (isSafeError) {
    return {
      error: error.name,
      message: error.message,
      ...(error.field && { field: error.field }),
      ...(error.resource && { resource: error.resource })
    };
  }

  // Generic error per production
  return {
    error: 'InternalServerError',
    message: statusCode === 503
      ? 'Service temporarily unavailable'
      : 'An error occurred processing your request'
  };
}

/**
 * Express error handler middleware
 */
export function errorHandlerMiddleware(err, req, res, next) {
  console.error('❌ Error in request:', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack
  });

  const statusCode = err.statusCode || 500;
  const errorResponse = formatErrorResponse(err);

  res.status(statusCode).json(errorResponse);
}

/**
 * Async route wrapper per error handling automatico
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default {
  withRetry,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  RateLimitError,
  DatabaseError,
  ExternalServiceError,
  formatErrorResponse,
  errorHandlerMiddleware,
  asyncHandler
};
