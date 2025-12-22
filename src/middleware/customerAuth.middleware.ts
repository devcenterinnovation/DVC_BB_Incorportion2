/**
 * Customer Authentication Middleware
 * Handles customer API key authentication and usage tracking
 */

import bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import { CustomerService } from '../services/customer.service.js';
import { http } from '../utils/error.util.js';

// NOTE: DB-only verification; no portal store fallback at runtime.

/**
 * Enhanced request interface with customer context
 */
declare global {
  namespace Express {
    interface Request {
      customer?: {
        id: string;
        email: string;
        company?: string;
        plan: string;
        status: string;
      };
      apiKey?: {
        id: string;
        name: string;
        permissions: string[];
        requestsUsed: number;
        requestsLimit: number;
        rateLimitPerMin: number;
        status?: string;
      };
    }
  }
}

/**
 * Unified Customer API key authentication middleware
 * Handles both customer API keys (ck_*) and legacy tokens seamlessly
 */
export const authenticateCustomer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    // Check for Token scheme (Authorization: Token <key>)
    if (authHeader && authHeader.startsWith('Token ')) {
      const token = authHeader.substring(6).trim(); // Remove "Token " prefix and trim
      
      if (!token) {
        // Token validation logged via proper error handling
        http.unauthorized(res, 'INVALID_TOKEN', '1 API key is required');
        return;
      }

      // Try customer API key first (ck_ prefixed keys)
      if (token.startsWith('ck_')) {
        // First try the database-backed CustomerService
        let result = await CustomerService.getCustomerByApiKey(token);
        
        if (!result) {
          if (process.env.DEBUG_API_KEY === '1' || process.env.DEBUG_API_KEY === 'true') {
            console.warn('[auth] Invalid API key', { path: req.originalUrl, tokenPrefix: token.substring(0, 10) });
          }
          http.unauthorized(res, 'INVALID_API_KEY', 'Invalid or expired customer API key');
          return;
        }

        const { customer, apiKey } = result;

        // Check usage limits (database-backed customers)
        const usageCheck = await CustomerService.checkUsageLimits(customer.id, apiKey.id);
        if (!usageCheck.allowed) {
          http.tooMany(res, 'PLAN_RATE_LIMIT', 'Rate limit exceeded for your plan');
          return;
        }

        // Add customer and API key info to request
        req.customer = {
          id: customer.id,
          email: customer.email,
          company: customer.company,
          plan: customer.plan,
          status: customer.status
        };

        req.apiKey = {
          id: apiKey.id,
          name: apiKey.name,
          permissions: apiKey.permissions,
          requestsUsed: apiKey.requestsUsed,
          requestsLimit: apiKey.requestsLimit,
          rateLimitPerMin: apiKey.rateLimitPerMin
        };

        next();
        return;
      }
      
      // Handle legacy agent IDs
      if (token.startsWith('AGT_') || token.includes('agent')) {
        // Legacy mode - create a temporary customer context
        req.customer = {
          id: 'legacy_customer',
          email: 'legacy@system.com',
          plan: 'basic',
          status: 'active'
        };
        
        req.apiKey = {
          id: 'legacy_key',
          name: 'Legacy Agent Key',
          permissions: ['business:read', 'business:write'],
          requestsUsed: 0,
          requestsLimit: 1000,
          rateLimitPerMin: 10
        };
        
        next();
        return;
      }
      
      // Unknown token format
      http.unauthorized(res, 'INVALID_TOKEN_FORMAT', 'Unrecognized token format. Use customer API keys (ck_*) or legacy agent IDs');
      return;
    }
    
    // Check for Bearer scheme (Authorization: Bearer <key>) - backward compatibility
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim(); // Remove "Bearer " prefix and trim
      
      if (!token) {
        http.unauthorized(res, 'INVALID_TOKEN', 'Bearer token is required');
        return;
      }

      // Try customer API key with Bearer scheme
      if (token.startsWith('ck_')) {
        const result = await CustomerService.getCustomerByApiKey(token);
        
        if (!result) {
          if (process.env.DEBUG_API_KEY === '1' || process.env.DEBUG_API_KEY === 'true') {
            console.warn('[auth] Invalid API key', { path: req.originalUrl, tokenPrefix: token.substring(0, 10) });
          }
          http.unauthorized(res, 'INVALID_API_KEY', 'Invalid or expired customer API key');
          return;
        }

        const { customer, apiKey } = result;

        // Check usage limits
        const usageCheck = await CustomerService.checkUsageLimits(customer.id, apiKey.id);
        
        if (!usageCheck.allowed) {
          http.tooMany(res, 'PLAN_RATE_LIMIT', 'Rate limit exceeded for your plan');
          return;
        }

        // Add customer and API key info to request
        req.customer = {
          id: customer.id,
          email: customer.email,
          company: customer.company,
          plan: customer.plan,
          status: customer.status
        };

        req.apiKey = {
          id: apiKey.id,
          name: apiKey.name,
          permissions: apiKey.permissions,
          requestsUsed: apiKey.requestsUsed,
          requestsLimit: apiKey.requestsLimit,
          rateLimitPerMin: apiKey.rateLimitPerMin
        };

        next();
        return;
      }
    }

    // No valid authentication provided
    http.unauthorized(res, 'MISSING_TOKEN', 'Authorization header with Token or Bearer scheme is required');
    return;

  } catch (error) {
    console.error('Customer authentication error:', error);
    http.serverError(res, 'CUSTOMER_AUTH_ERROR', 'Failed to authenticate customer');
    return;
  }
};

/**
 * Usage tracking middleware
 * Records API usage for billing and analytics
 */
export const trackUsage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  // Usage tracking is now handled by usageLogger middleware
  // This middleware only authenticates the customer
  next();
};

/**
 * Check if customer has specific permission
 */
export const requireCustomerPermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.apiKey || !req.apiKey.permissions.includes(permission)) {
      http.forbidden(res, 'INSUFFICIENT_PERMISSIONS', `Permission required: ${permission}`);
      return;
    }

    next();
  };
};

/**
 * Rate limiting based on customer plan
 */
export const rateLimitByPlan = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.apiKey) {
      next();
      return;
    }

    // Simple rate limiting check (in production, use Redis or similar)
    // For now, we rely on the existing rate limiting middleware
    // but this can be enhanced to use customer-specific limits
    
    next();
  } catch (error) {
    console.error('Rate limiting error:', error);
    next(); // Don't block on rate limiting errors
  }
};
