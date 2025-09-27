/**
 * 🔐 Security Middleware - Lucine di Natale
 * Comprehensive security layer for chatbot system
 */

import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../server.js';

// Environment variables validation
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-in-production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-session-secret';

if (!process.env.JWT_SECRET) {
    console.warn('⚠️  JWT_SECRET not set in environment - using fallback');
}

/**
 * 🔑 JWT Token Management
 */
export class TokenManager {
    static generateToken(payload, expiresIn = '24h') {
        return jwt.sign(payload, JWT_SECRET, { expiresIn });
    }
    
    static verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            throw new Error('Invalid token');
        }
    }
    
    static generateSessionId() {
        return crypto.randomBytes(32).toString('hex');
    }
    
    static hashPassword(password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
        return { salt, hash };
    }
    
    static verifyPassword(password, salt, hash) {
        const hashVerify = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
        return hash === hashVerify;
    }
}

/**
 * 🛡️ Rate Limiting Configurations
 */

// API General Rate Limiting
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Troppi tentativi, riprova più tardi',
        retryAfter: 15 * 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.warn(`🚨 Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            error: 'Troppi tentativi, riprova più tardi',
            retryAfter: 15 * 60
        });
    }
});

// Chat API Stricter Rate Limiting
export const chatLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // limit each IP to 20 requests per minute
    message: {
        error: 'Troppe richieste di chat, rallenta',
        retryAfter: 60
    },
    skip: (req) => {
        // Skip rate limiting for authenticated operators
        return req.headers.authorization && req.headers.authorization.startsWith('Bearer');
    }
});

// Login Rate Limiting (Brute Force Protection)
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 login attempts per windowMs
    message: {
        error: 'Troppi tentativi di login, riprova tra 15 minuti',
        retryAfter: 15 * 60
    },
    skipSuccessfulRequests: true
});

/**
 * 🔐 Authentication Middleware
 */
export const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            error: 'Token di accesso richiesto',
            code: 'MISSING_TOKEN'
        });
    }
    
    try {
        const decoded = TokenManager.verifyToken(token);
        
        // Verify operator still exists and is active
        const operator = await prisma.operator.findUnique({
            where: { 
                id: decoded.operatorId,
                isActive: true 
            }
        });
        
        if (!operator) {
            return res.status(401).json({ 
                error: 'Operatore non valido o disattivato',
                code: 'INVALID_OPERATOR'
            });
        }
        
        req.operator = operator;
        req.token = decoded;
        next();
    } catch (error) {
        console.warn(`🔐 Authentication failed: ${error.message} for IP: ${req.ip}`);
        return res.status(403).json({ 
            error: 'Token non valido',
            code: 'INVALID_TOKEN'
        });
    }
};

/**
 * 🛡️ Session Validation Middleware
 */
export const validateSession = async (req, res, next) => {
    const sessionId = req.headers['x-session-id'] || req.body.sessionId;
    
    if (!sessionId) {
        return res.status(400).json({
            error: 'Session ID richiesto',
            code: 'MISSING_SESSION'
        });
    }
    
    try {
        const session = await prisma.chatSession.findUnique({
            where: { sessionId }
        });
        
        if (!session) {
            return res.status(404).json({
                error: 'Sessione non trovata',
                code: 'SESSION_NOT_FOUND'
            });
        }
        
        req.session = session;
        next();
    } catch (error) {
        console.error('❌ Session validation error:', error);
        return res.status(500).json({
            error: 'Errore validazione sessione',
            code: 'SESSION_VALIDATION_ERROR'
        });
    }
};

/**
 * 🔍 Input Sanitization Middleware
 */
export const sanitizeInput = (req, res, next) => {
    const sanitizeString = (str) => {
        if (typeof str !== 'string') return str;
        
        // Remove potential XSS attempts
        return str
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '')
            .trim();
    };
    
    const sanitizeObject = (obj) => {
        if (typeof obj !== 'object' || obj === null) return obj;
        
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                obj[key] = sanitizeString(obj[key]);
            } else if (typeof obj[key] === 'object') {
                obj[key] = sanitizeObject(obj[key]);
            }
        }
        return obj;
    };
    
    // Sanitize request body
    if (req.body) {
        req.body = sanitizeObject(req.body);
    }
    
    // Sanitize query parameters
    if (req.query) {
        req.query = sanitizeObject(req.query);
    }
    
    next();
};

/**
 * 🔒 CORS Security Headers
 */
export const securityHeaders = (req, res, next) => {
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Content Security Policy
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
        "font-src 'self' https://cdnjs.cloudflare.com",
        "img-src 'self' data: https:",
        "connect-src 'self' ws: wss:",
        "frame-ancestors 'none'"
    ].join('; '));
    
    next();
};

/**
 * 📊 Security Logging Middleware
 */
export const securityLogger = (req, res, next) => {
    const start = Date.now();
    const originalSend = res.send;
    
    res.send = function(data) {
        const duration = Date.now() - start;
        const logData = {
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            status: res.statusCode,
            duration,
            timestamp: new Date().toISOString()
        };
        
        // Log security-relevant events
        if (res.statusCode === 401 || res.statusCode === 403) {
            console.warn('🚨 Security Alert:', logData);
        } else if (res.statusCode >= 400) {
            console.error('❌ Error Request:', logData);
        } else if (req.originalUrl.includes('/login') || req.originalUrl.includes('/auth')) {
            console.log('🔐 Auth Request:', logData);
        }
        
        originalSend.call(this, data);
    };
    
    next();
};

/**
 * 🛡️ Admin Role Check
 */
export const requireAdmin = (req, res, next) => {
    if (!req.operator) {
        return res.status(401).json({
            error: 'Autenticazione richiesta',
            code: 'AUTH_REQUIRED'
        });
    }
    
    if (req.operator.role !== 'ADMIN' && req.operator.username !== 'admin') {
        return res.status(403).json({
            error: 'Permessi amministratore richiesti',
            code: 'ADMIN_REQUIRED'
        });
    }
    
    next();
};

/**
 * 🔐 Session Cleanup Utility
 */
export const cleanupExpiredSessions = async () => {
    try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const result = await prisma.chatSession.updateMany({
            where: {
                status: 'ACTIVE',
                startedAt: { lt: oneDayAgo }
            },
            data: {
                status: 'ENDED',
                endedAt: new Date()
            }
        });
        
        if (result.count > 0) {
            console.log(`🧹 Cleaned up ${result.count} expired sessions`);
        }
    } catch (error) {
        console.error('❌ Session cleanup error:', error);
    }
};

/**
 * 🔍 Suspicious Activity Detection
 */
export const detectSuspiciousActivity = (req, res, next) => {
    const suspiciousPatterns = [
        /(\.\.\/)|(\.\.\\)/g, // Directory traversal
        /<script|<iframe|javascript:|data:text\/html/gi, // XSS attempts
        /union\s+select|drop\s+table|insert\s+into/gi, // SQL injection
        /\$\{.*\}|\#\{.*\}/g, // Template injection
    ];
    
    const requestData = JSON.stringify({
        url: req.originalUrl,
        body: req.body,
        query: req.query,
        headers: req.headers
    });
    
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(requestData)) {
            console.error('🚨 SUSPICIOUS ACTIVITY DETECTED:', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                url: req.originalUrl,
                pattern: pattern.toString(),
                timestamp: new Date().toISOString()
            });
            
            return res.status(400).json({
                error: 'Richiesta non valida',
                code: 'SUSPICIOUS_ACTIVITY'
            });
        }
    }
    
    next();
};

/**
 * 🚨 Emergency Security Lockdown
 */
export const emergencyLockdown = () => {
    return (req, res) => {
        res.status(503).json({
            error: 'Sistema temporaneamente non disponibile per manutenzione di sicurezza',
            code: 'EMERGENCY_LOCKDOWN',
            timestamp: new Date().toISOString()
        });
    };
};

// Run session cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

export default {
    TokenManager,
    apiLimiter,
    chatLimiter,
    loginLimiter,
    authenticateToken,
    validateSession,
    sanitizeInput,
    securityHeaders,
    securityLogger,
    requireAdmin,
    detectSuspiciousActivity,
    emergencyLockdown
};