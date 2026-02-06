import type { Request, Response, NextFunction } from 'express';
import { http } from '../utils/error.util';

/**
 * Security headers middleware for banking-grade security
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://app.documents.com.ng; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  res.setHeader('X-Request-ID', req.requestId || 'unknown');
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Content-Type', 'application/json');
  next();
};

/**
 * Relaxed CORS for local development (can be tightened later)
 */
export const corsConfig = (req: Request, res: Response, next: NextFunction): Response | void => {
  const origin = req.headers.origin as string | undefined;
  const isProd = process.env.NODE_ENV === 'production';
  const allowlist = (process.env.CORS_ALLOWLIST || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (isProd) {
    if (origin && allowlist.length > 0) {
      const allowed = allowlist.includes(origin);
      if (!allowed) {
        http.forbidden(res, 'FORBIDDEN_ORIGIN', 'CORS origin not allowed');
        return;
      }
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else if (!origin) {
      // No origin header: allow same-origin non-browser requests in prod
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  } else {
    // Development: relaxed CORS
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Request-ID, X-Correlation-ID'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
};

/**
 * Request size limiting middleware
 */
export const requestSizeLimit = (req: Request, res: Response, next: NextFunction): Response | void => {
  const maxRequestSize = 10 * 1024 * 1024; // 10MB
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > maxRequestSize) {
    http.badRequest(res, 'PAYLOAD_TOO_LARGE', 'Payload too large');
    return;
  }
  next();
};

/**
 * HTTP method validation middleware
 */
export const validateHttpMethod = (req: Request, res: Response, next: NextFunction): Response | void => {
  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
  if (!allowedMethods.includes(req.method)) {
    http.badRequest(res, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    return;
  }
  next();
};

/**
 * IP whitelist middleware (for additional security)
 */
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    const clientIP = getClientIP(req);
    if (req.path.includes('health') || req.path.includes('monitoring')) {
      return next();
    }
    if (!allowedIPs.includes(clientIP)) {
      http.forbidden(res, 'FORBIDDEN_ORIGIN', 'CORS origin not allowed');
      return;
    }
    next();
  };
};

/**
 * SSL/HTTPS enforcement middleware (skips localhost in dev)
 */
export const enforceHTTPS = (req: Request, res: Response, next: NextFunction): void => {
  if (
    process.env.NODE_ENV === 'development' ||
    req.headers.host?.includes('localhost') ||
    req.headers.host?.includes('127.0.0.1')
  ) {
    return next();
  }
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (!isSecure) {
    const httpsUrl = `https://${req.headers.host}${req.url}`;
    res.redirect(301, httpsUrl);
    return;
  }
  next();
};

/**
 * Header validation middleware
 */
export const validateHeaders = (req: Request, res: Response, next: NextFunction): Response | void => {
  const requiredHeaders = ['content-type'];
  for (const header of requiredHeaders) {
    if (!req.headers[header]) {
      http.badRequest(res, 'MISSING_HEADER', `Required header '${header}' is missing`);
      return;
    }
  }
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('application/json')) {
      http.badRequest(res, 'INVALID_CONTENT_TYPE', 'Content-Type must be application/json');
      return;
    }
  }
  next();
};

/**
 * Get client IP address from request
 */
const getClientIP = (req: Request): string => {
  return (
    (req.headers['x-forwarded-for'] as string) ||
    (req.headers['x-real-ip'] as string) ||
    // @ts-ignore - Node typings variance
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    'unknown'
  );
};

/**
 * Disable caching for sensitive endpoints
 */
export const disableCache = (req: Request, res: Response, next: NextFunction): void => {
  if (req.path.includes('name-search') || req.path.includes('auth') || req.path.includes('admin')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
};

/**
 * Security event logging middleware
 */
export const securityEventLogger = (req: Request, res: Response, next: NextFunction): void => {
  const securityEvents = [
    req.path.includes('auth'),
    req.path.includes('admin'),
    req.path.includes('api-key'),
    res.statusCode >= 400,
    req.headers['user-agent']?.includes('bot'),
    req.headers['user-agent']?.includes('crawler'),
  ];
  if (securityEvents.some(Boolean)) {
    console.warn('Security event detected', {
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      correlationId: req.correlationId,
      ip: getClientIP(req),
      method: req.method,
      url: req.originalUrl,
      userAgent: req.headers['user-agent'],
      statusCode: res.statusCode,
      clientId: req.clientId,
      userId: req.user?.id,
    });
  }
  next();
};

export default {
  securityHeaders,
  corsConfig,
  requestSizeLimit,
  validateHttpMethod,
  ipWhitelist,
  enforceHTTPS,
  validateHeaders,
  disableCache,
  securityEventLogger,
};