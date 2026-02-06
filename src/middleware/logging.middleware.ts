import type { Request, Response, NextFunction } from 'express';
import { http } from '../utils/error.util';
import { randomUUID } from 'crypto';
import winston from 'winston';
import type { AuditLogEntry, RequestContext } from '../types/api';

// Note: Request interface extensions are consolidated in types/index.ts

// Configure Winston logger for audit trails
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'business-api-middleware',
    version: '1.0.0',
  },
  transports: [
    // Only log to console in development mode or when explicitly enabled
    ...(process.env.NODE_ENV === 'development' || process.env.ENABLE_CONSOLE_LOGS === 'true' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        ),
      })
    ] : []),
    // File logging disabled in production for performance
    // Uncomment below for file logging in development
    /*
    new winston.transports.File({
      filename: 'logs/audit.log',
      level: 'info',
    }),
    new winston.transports.File({
      filename: 'logs/error.log', 
      level: 'error',
    }),
    */
  ],
});

// In-memory store for audit logs (in production, use a database)
const auditLogs: AuditLogEntry[] = [];

/**
 * Generate unique request ID
 */
const generateRequestId = (): string => {
  return randomUUID();
};

/**
 * Get client IP address from request
 */
const getClientIP = (req: Request): string => {
  return (
    req.headers['x-forwarded-for'] as string ||
    req.headers['x-real-ip'] as string ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    'unknown'
  );
};

/**
 * Middleware to generate request ID and track request context
 */
export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Generate unique request ID
  req.requestId = generateRequestId();
  
  // Set correlation ID for distributed tracing
  req.correlationId = req.headers['x-correlation-id'] as string || req.requestId;
  
  // Record start time for response time calculation
  req.startTime = Date.now();
  
  // Create request context
  req.requestContext = {
    requestId: req.requestId,
    userId: req.user?.id || undefined,
    clientId: req.clientId || 'anonymous',
    ip: getClientIP(req),
    userAgent: req.headers['user-agent'] || 'unknown',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    correlationId: req.correlationId,
  };

  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);
  res.setHeader('X-Correlation-ID', req.correlationId);

  // Log incoming request only in debug mode
  // Disabled by default to reduce console spam
  // if (process.env.LOG_LEVEL === 'debug') {
  //   logger.info('Incoming request', {
  //     requestId: req.requestId,
  //     method: req.method,
  //     url: req.originalUrl,
  //     ip: getClientIP(req),
  //   });
  // }

  next();
};

/**
 * Middleware to log API responses
 */
export const responseLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.send;
  const originalJson = res.json;

  let responseBody: any;

  // Override res.send to capture response body
  res.send = function(body: any) {
    responseBody = body;
    return originalSend.call(this, body);
  };

  // Override res.json to capture response body
  res.json = function(body: any) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  // Log response when response finishes
  res.on('finish', () => {
    const responseTime = req.startTime ? Date.now() - req.startTime : 0;
    
    const logEntry: AuditLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      requestId: req.requestId || 'unknown',
      correlationId: req.correlationId,
      userId: req.user?.id,
      clientId: req.clientId || 'anonymous',
      action: req.path.includes('name-search') ? 'name_search' : 'api_request',
      resource: req.route?.path || req.path,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTimeMs: responseTime,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      success: res.statusCode < 400,
      metadata: {
        contentLength: res.get('content-length'),
        contentType: res.get('content-type'),
      },
    };

    // Store in memory (in production, store in database)
    auditLogs.push(logEntry);

    // Log to Winston only for errors and in development mode
    // Disabled success logging to reduce console spam
    if (res.statusCode >= 400 && process.env.LOG_LEVEL === 'error') {
      // Log a concise summary only – no large bodies to keep logs clean
      const errorCode = (() => {
        try {
          const parsed = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
          return parsed?.error?.code || parsed?.data?.status_key;
        } catch {
          return undefined;
        }
      })();
      const errorMessage = (() => {
        try {
          const parsed = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
          return parsed?.error?.message || parsed?.data?.message;
        } catch {
          return undefined;
        }
      })();

      logger.error('API response error', {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: responseTime,
        errorCode,
        errorMessage,
      });
    }
    // Success response logging completely disabled to reduce noise
    // Enable by setting LOG_LEVEL=debug for debugging

    // Store audit logs in memory (keep last 1000 entries)
    if (auditLogs.length > 1000) {
      auditLogs.splice(0, auditLogs.length - 1000);
    }
  });

  next();
};

/**
 * Middleware to log authentication events
 */
export const authenticationLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.send;
  
  res.send = function(body: any) {
    const responseBody = body ? (() => {
      try {
        return JSON.parse(body);
      } catch {
        return body; // Return raw body if JSON parsing fails
      }
    })() : null;
    
    // Log authentication events
    if (req.path.includes('auth') || req.headers[process.env.API_KEY_HEADER || 'x-api-key']) {
      const authLogEntry: AuditLogEntry = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        requestId: req.requestId || 'unknown',
        correlationId: req.correlationId,
        clientId: req.clientId || 'anonymous',
        action: res.statusCode === 200 ? 'auth_success' : 'auth_failed',
        resource: req.route?.path || req.path,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        responseTimeMs: req.startTime ? Date.now() - req.startTime : 0,
        ip: getClientIP(req),
        userAgent: req.headers['user-agent'] || 'unknown',
        success: res.statusCode === 200,
        errorMessage: res.statusCode !== 200 ? responseBody?.error?.message : undefined,
        metadata: {
          authMethod: req.headers[process.env.API_KEY_HEADER || 'x-api-key'] ? 'api_key' : 'jwt',
        },
      };

      auditLogs.push(authLogEntry);
      
      // Only log auth events in debug mode to reduce console spam
      if (process.env.LOG_LEVEL === 'debug') {
        logger.info('Authentication event', authLogEntry);
      }
    }

    return originalSend.call(this, body);
  };

  next();
};

/**
 * Middleware to log security events
 */
// TODO(rovodev): ensure structured logs (ts, route, status, user/admin id, traceId); avoid PII in logs
export const securityLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Log potential security threats
  const suspiciousPatterns = [
    /(\<|%3C)script(\>|%3E)/i, // XSS attempts
    /(union|select|insert|delete|update|drop|create|alter)/i, // SQL injection
    /(\.\.\/|\.\.\\)/, // Path traversal
  ];

  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(req.originalUrl) || 
    pattern.test(JSON.stringify(req.body || {})) ||
    pattern.test(JSON.stringify(req.query || {}))
  );

  if (isSuspicious) {
    const securityLogEntry: AuditLogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      requestId: req.requestId || 'unknown',
      correlationId: req.correlationId,
      clientId: req.clientId || 'suspicious',
      action: 'security_threat',
      resource: req.route?.path || req.path,
      method: req.method,
      url: req.originalUrl,
      statusCode: 403,
      responseTimeMs: req.startTime ? Date.now() - req.startTime : 0,
      ip: getClientIP(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      success: false,
      errorMessage: 'Suspicious request pattern detected',
      metadata: {
        threatType: 'potential_injection_attempt',
        requestBody: req.body,
        queryParams: req.query,
      },
    };

    auditLogs.push(securityLogEntry);
    
    // Always log security threats (important!)
    logger.warn('Security threat detected', securityLogEntry);
    
    http.forbidden(res, 'AUDIT_FORBIDDEN', 'Forbidden by audit policy');
    return;
  }

  next();
};

/**
 * Get audit logs (admin only)
 */
export const getAuditLogs = (req: Request, res: Response): void => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  
  const logs = auditLogs
    .slice()
    .reverse()
    .slice(offset, offset + limit);

  res.json({
    success: true,
    data: {
      logs,
      pagination: {
        total: auditLogs.length,
        limit,
        offset,
        hasMore: offset + limit < auditLogs.length,
      },
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  });
};

/**
 * Get audit logs by request ID
 */
export const getAuditLogsByRequestId = (req: Request, res: Response): void => {
  const requestId = req.params.requestId;
  
  const logs = auditLogs.filter(log => log.requestId === requestId);

  res.json({
    success: true,
    data: {
      logs,
      count: logs.length,
    },
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  });
};

export default {
  requestContextMiddleware,
  responseLoggingMiddleware,
  authenticationLoggingMiddleware,
  securityLoggingMiddleware,
  getAuditLogs,
  getAuditLogsByRequestId,
  logger,
};