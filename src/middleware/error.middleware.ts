import type { Request, Response, NextFunction } from 'express';
import { ApiError, sendError } from '../utils/error.util.js';
import config from '../config/index.js';

/**
 * Global error handling middleware
 * Handles ApiError instances and converts unknown errors to standardized format
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // If response already sent, delegate to default error handler
  if (res.headersSent) {
    return next(error);
  }

  // Handle our ApiError instances
  if (error instanceof ApiError) {
    error.send(res, req);
    return;
  }

  // Handle JSON parsing errors
  if (error instanceof SyntaxError && error.message.includes('JSON')) {
    sendError(
      res,
      'INVALID_JSON',
      'Invalid JSON in request body',
      400,
      config.isDevelopment ? { originalError: error.message } : undefined,
      req
    );
    return;
  }

  // Handle unknown errors - only log in development or when explicitly enabled
  if (process.env.NODE_ENV === 'development' || process.env.LOG_LEVEL === 'error') {
    console.error('[ERROR] Unhandled error:', error);
  }
  
  sendError(
    res,
    'INTERNAL_ERROR',
    config.isProduction 
      ? 'Internal server error' 
      : error.message || 'Unknown error occurred',
    500,
    config.isDevelopment ? { originalError: error.message, stack: error.stack } : undefined,
    req
  );
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  sendError(
    res,
    'ROUTE_NOT_FOUND',
    `Route ${req.method} ${req.originalUrl} not found`,
    404,
    undefined,
    req
  );
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors automatically
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};