/**
 * 🎯 Standardized API Response Utilities - Lucine di Natale
 * Consistent response format across all endpoints
 */

/**
 * Standard success response format
 */
export function successResponse(data, message = null, meta = {}) {
    return {
        success: true,
        data,
        message,
        meta: {
            timestamp: new Date().toISOString(),
            ...meta
        }
    };
}

/**
 * Standard error response format
 */
export function errorResponse(error, code = 'INTERNAL_ERROR', details = null) {
    const response = {
        success: false,
        error: {
            message: error,
            code,
            timestamp: new Date().toISOString()
        }
    };

    // Add details only in development mode
    if (process.env.NODE_ENV === 'development' && details) {
        response.error.details = details;
    }

    return response;
}

/**
 * Standard validation error response
 */
export function validationErrorResponse(errors) {
    return {
        success: false,
        error: {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            errors,
            timestamp: new Date().toISOString()
        }
    };
}

/**
 * Standard pagination response
 */
export function paginatedResponse(data, pagination, message = null) {
    return {
        success: true,
        data,
        message,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            pages: Math.ceil(pagination.total / pagination.limit),
            hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
            hasPrevious: pagination.page > 1
        },
        meta: {
            timestamp: new Date().toISOString()
        }
    };
}

/**
 * Standard list response with counts
 */
export function listResponse(items, counts = {}, message = null) {
    return {
        success: true,
        data: {
            items,
            count: items.length,
            ...counts
        },
        message,
        meta: {
            timestamp: new Date().toISOString()
        }
    };
}

/**
 * Middleware to send standardized responses
 */
export function standardizeResponse(req, res, next) {
    // Add helper methods to response object
    res.success = (data, message, meta) => {
        res.json(successResponse(data, message, meta));
    };

    res.error = (error, code, statusCode = 500) => {
        res.status(statusCode).json(errorResponse(error, code));
    };

    res.validationError = (errors, statusCode = 400) => {
        res.status(statusCode).json(validationErrorResponse(errors));
    };

    res.paginated = (data, pagination, message) => {
        res.json(paginatedResponse(data, pagination, message));
    };

    res.list = (items, counts, message) => {
        res.json(listResponse(items, counts, message));
    };

    next();
}

/**
 * Standard HTTP status codes
 */
export const StatusCodes = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
};

/**
 * Standard error codes
 */
export const ErrorCodes = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
    OPERATOR_NOT_FOUND: 'OPERATOR_NOT_FOUND',
    CHAT_ALREADY_TAKEN: 'CHAT_ALREADY_TAKEN',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS'
};

export default {
    successResponse,
    errorResponse,
    validationErrorResponse,
    paginatedResponse,
    listResponse,
    standardizeResponse,
    StatusCodes,
    ErrorCodes
};