// Request timeout middleware for Express
import type { Request, Response, NextFunction } from 'express';
import { TimeoutError } from '../types/errors';

/**
 * Global request timeout middleware
 * Sets a timeout for all incoming requests
 */
export const requestTimeout = (timeoutMs: number = 20000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Set timeout for the request
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        const error = new TimeoutError('Request Handler', timeoutMs);
        
        // Log the timeout
        console.error('Request timeout occurred', {
          requestId: req.requestId || 'unknown',
          method: req.method,
          url: req.url,
          userAgent: req.get('user-agent'),
          ip: req.ip,
          timeoutMs,
          timestamp: new Date().toISOString(),
        });

        // Send timeout response
        res.status(504).json({
          success: false,
          error: {
            code: 'REQUEST_TIMEOUT',
            message: error.message,
            requestId: req.requestId || 'unknown',
            timeoutMs,
          },
          timestamp: new Date().toISOString(),
          requestId: req.requestId || 'unknown',
        });
      }
    }, timeoutMs);

    // Clear timeout when response finishes
    res.on('finish', () => {
      clearTimeout(timeout);
    });

    // Clear timeout when response is closed
    res.on('close', () => {
      clearTimeout(timeout);
    });

    next();
  };
};

/**
 * API-specific timeout middleware with shorter timeout
 */
export const apiTimeout = requestTimeout(60000); // 60 seconds - reduced for faster responses

/**
 * Health check timeout middleware with very short timeout
 */
export const healthCheckTimeout = requestTimeout(5000); // 5 seconds

export default {
  requestTimeout,
  apiTimeout,
  healthCheckTimeout,
};