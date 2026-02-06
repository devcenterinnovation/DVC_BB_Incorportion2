import type { Request, Response, NextFunction } from 'express';
import { http } from '../utils/error.util';
import { RateLimitError } from '../types/errors';
import type { RateLimitInfo } from '../types/api';

// Rate limiting configuration
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'); // 15 minutes
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100');
const SKIP_FAILED_REQUESTS = process.env.RATE_LIMIT_SKIP_FAILED_REQUESTS === 'true';

// Rate limit store (in production, use Redis)
interface RateLimitEntry {
  count: number;
  resetTime: number;
  requests: number[];
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries from the store
 */
const cleanupExpiredEntries = (): void => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime <= now) {
      rateLimitStore.delete(key);
    }
  }
};

/**
 * Generate rate limit key based on client identifier
 */
const generateRateLimitKey = (req: Request): string => {
  // Priority: Authenticated user ID > Client ID > IP Address
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }
  
  if (req.clientId) {
    return `client:${req.clientId}`;
  }
  
  // Use IP address as fallback
  const ip = getClientIP(req);
  return `ip:${ip}`;
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
 * Get rate limit configuration for specific endpoint or user
 */
const getRateLimitConfig = (req: Request): { windowMs: number; maxRequests: number } => {
  // Different limits for different endpoints
  if (req.path.includes('name-search')) {
    // More restrictive for name search (banking operation)
    return {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 50, // 50 requests per 15 minutes
    };
  }
  
  if (req.path.includes('health')) {
    // More generous for health checks
    return {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 300, // 300 requests per minute
    };
  }
  
  if (req.user?.role === 'admin') {
    // Higher limits for admin users
    return {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 200, // 200 requests per 15 minutes
    };
  }
  
  // Default limits
  return {
    windowMs: WINDOW_MS,
    maxRequests: MAX_REQUESTS,
  };
};

/**
 * Advanced rate limiting middleware with sliding window algorithm
 */
export const advancedRateLimit = (req: Request, res: Response, next: NextFunction): void => {
  cleanupExpiredEntries();
  
  const key = generateRateLimitKey(req);
  const config = getRateLimitConfig(req);
  const now = Date.now();
  
  // Get or create rate limit entry
  let entry = rateLimitStore.get(key);
  
  if (!entry || entry.resetTime <= now) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
      requests: [],
    };
    rateLimitStore.set(key, entry);
  }
  
  // Remove requests outside the current window
  const windowStart = now - config.windowMs;
  entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);
  entry.count = entry.requests.length;
  
  // Check if limit is exceeded
  if (entry.count >= config.maxRequests) {
    const resetTime = Math.ceil((entry.resetTime - now) / 1000);
    
    // Log rate limit exceedance
    console.warn(`Rate limit exceeded for ${key}`, {
      key,
      count: entry.count,
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      resetTime,
      ip: getClientIP(req),
      userId: req.user?.id,
      clientId: req.clientId,
    });
    
    const rateLimitError = new RateLimitError(
      'Too many requests. Please try again later.',
      resetTime
    );
    
    res.status(rateLimitError.statusCode).json({
      success: false,
      error: {
        code: rateLimitError.code,
        message: rateLimitError.message,
        details: {
          retryAfter: resetTime,
          limit: config.maxRequests,
          windowMs: config.windowMs,
          requestId: req.requestId,
        },
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
    
    res.setHeader('Retry-After', resetTime.toString());
    res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('X-RateLimit-Reset', entry.resetTime.toString());
    return;
  }
  
  // Add current request to the window
  entry.requests.push(now);
  entry.count = entry.requests.length;
  
  // Calculate remaining requests
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const resetTime = Math.ceil((entry.resetTime - now) / 1000);
  
  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  res.setHeader('X-RateLimit-Reset', entry.resetTime.toString());
  
  next();
};

/**
 * Simple rate limiting middleware (fallback)
 */
export const simpleRateLimit = (req: Request, res: Response, next: NextFunction): void => {
  const key = generateRateLimitKey(req);
  const now = Date.now();
  
  // Get or create rate limit entry
  let entry = rateLimitStore.get(key);
  
  if (!entry || entry.resetTime <= now) {
    entry = {
      count: 0,
      resetTime: now + WINDOW_MS,
      requests: [],
    };
    rateLimitStore.set(key, entry);
  }
  
  // Check if limit is exceeded (only count successful requests if configured)
  if (SKIP_FAILED_REQUESTS) {
    // This is a simplified version - in real implementation, 
    // you'd need to track request success/failure
    entry.count++;
  } else {
    entry.count++;
  }
  
  if (entry.count > MAX_REQUESTS) {
    const resetTime = Math.ceil((entry.resetTime - now) / 1000);
    
    const rateLimitError = new RateLimitError(
      'Too many requests. Please try again later.',
      resetTime
    );
    
    res.status(rateLimitError.statusCode).json({
      success: false,
      error: {
        code: rateLimitError.code,
        message: rateLimitError.message,
        details: {
          retryAfter: resetTime,
          limit: MAX_REQUESTS,
          windowMs: WINDOW_MS,
          requestId: req.requestId,
        },
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
    
    res.setHeader('Retry-After', resetTime.toString());
    return;
  }
  
  // Set basic rate limit headers
  const remaining = Math.max(0, MAX_REQUESTS - entry.count);
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS.toString());
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  res.setHeader('X-RateLimit-Reset', entry.resetTime.toString());
  
  next();
};

/**
 * Burst protection middleware
 * Prevents rapid successive requests from the same client
 */
export const burstProtection = (req: Request, res: Response, next: NextFunction): void => {
  const key = generateRateLimitKey(req);
  const now = Date.now();
  const BURST_WINDOW = 1000; // 1 second
  const MAX_BURST_REQUESTS = 5; // Max 5 requests per second
  
  const burstKey = `burst:${key}`;
  let burstEntry = rateLimitStore.get(burstKey);
  
  if (!burstEntry || burstEntry.resetTime <= now) {
    burstEntry = {
      count: 0,
      resetTime: now + BURST_WINDOW,
      requests: [],
    };
    rateLimitStore.set(burstKey, burstEntry);
  }
  
  // Remove old requests from burst window
  const windowStart = now - BURST_WINDOW;
  burstEntry.requests = burstEntry.requests.filter(timestamp => timestamp > windowStart);
  burstEntry.count = burstEntry.requests.length;
  
  // Check burst limit
  if (burstEntry.count >= MAX_BURST_REQUESTS) {
    const rateLimitError = new RateLimitError(
      'Too many rapid requests. Please slow down.',
      1
    );
    
    res.status(rateLimitError.statusCode).json({
      success: false,
      error: {
        code: rateLimitError.code,
        message: rateLimitError.message,
        details: {
          retryAfter: 1,
          burstLimit: MAX_BURST_REQUESTS,
          burstWindow: BURST_WINDOW,
          requestId: req.requestId,
        },
      },
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    });
    
    res.setHeader('Retry-After', '1');
    return;
  }
  
  // Add current request to burst window
  burstEntry.requests.push(now);
  burstEntry.count = burstEntry.requests.length;
  
  next();
};

/**
 * Get rate limit status for monitoring
 */
export const getRateLimitStatus = (req: Request, res: Response): void => {
  const key = generateRateLimitKey(req);
  const entry = rateLimitStore.get(key);
  const config = getRateLimitConfig(req);
  
  const status: RateLimitInfo = {
    limit: config.maxRequests,
    remaining: entry ? Math.max(0, config.maxRequests - entry.count) : config.maxRequests,
    reset: entry ? entry.resetTime : Date.now() + config.windowMs,
  };
  
  res.json({
    success: true,
    data: status,
    timestamp: new Date().toISOString(),
    requestId: req.requestId,
  });
};

/**
 * Reset rate limit for a specific client (admin only)
 */
export const resetRateLimit = (req: Request, res: Response): Response | void => {
  const clientId = req.params.clientId || req.query.clientId as string;
  
  if (!clientId) {
    http.badRequest(res, 'MISSING_CLIENT_ID', 'Client ID is required', { requestId: req.requestId });
    return;
  }
  
  // Remove all entries for this client
  let removedCount = 0;
  for (const [key] of rateLimitStore.entries()) {
    if (key.includes(clientId)) {
      rateLimitStore.delete(key);
      removedCount++;
    }
  }
  
  http.ok(res, { message: `Rate limit reset for client ${clientId}`, removedEntries: removedCount });
  return;
};

// Clean up expired entries every minute
setInterval(cleanupExpiredEntries, 60 * 1000);

export default {
  advancedRateLimit,
  simpleRateLimit,
  burstProtection,
  getRateLimitStatus,
  resetRateLimit,
};