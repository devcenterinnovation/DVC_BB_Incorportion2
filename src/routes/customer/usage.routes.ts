import { Router, type Request, type Response } from 'express';
import { authenticateCustomerJWT } from '../../middleware/customerJwt.middleware.js';
import { CustomerStore } from '../../services/customerPortal.store.js';
import { database } from '../../database/index.js';
import { http } from '../../utils/error.util.js';

/**
 * ===================================================================
 * CUSTOMER USAGE ROUTES
 * ===================================================================
 * Handles customer API usage tracking and statistics.
 * 
 * Authentication: JWT Token (from login)
 * 
 * The customer must be logged in (JWT token required) to view their usage stats.
 * This endpoint shows how many API calls they've made and helps them monitor
 * their usage against their plan limits.
 * 
 * Usage Tracking Flow:
 * 1. Customer logs in → receives JWT token
 * 2. Customer makes API calls using API keys (business operations)
 * 3. Each API call is tracked and logged
 * 4. Customer can view usage via this endpoint using their JWT token
 * 
 * Plan Limits:
 * - Basic Plan: Limited API calls per month
 * - Pro Plan: Higher limits or unlimited
 */

/**
 * Registers customer usage tracking routes.
 * 
 * Routes:
 * - GET /customer/usage - Get current customer's API usage statistics
 */
export function registerUsageRoutes(router: Router) {
  /**
   * GET /customer/usage
   * 
   * Retrieve the authenticated customer's API usage statistics.
   * 
   * Authentication: JWT Bearer token required
   * 
   * Response:
   * - usage: Object containing usage statistics
   *   - totalCalls: Total API calls made
   *   - period: Current billing period
   *   - limit: Plan limit (if applicable)
   *   - remaining: Calls remaining (if applicable)
   * 
   * Used by: Customer portal dashboard to display usage metrics
   * 
   * Example Response:
   * {
   *   "usage": {
   *     "totalCalls": 150,
   *     "period": "2024-01",
   *     "limit": 1000,
   *     "remaining": 850
   *   }
   * }
   */
  router.get('/usage', authenticateCustomerJWT, async (req: Request, res: Response) => {
    try {
      // Extract customer JWT payload (set by authenticateCustomerJWT middleware)
      const jwt = (req as any).customerJwt;
      
      if (!jwt || !jwt.customerId) {
        return http.unauthorized(
          res, 
          'AUTHENTICATION_REQUIRED', 
          'Please login to view your usage statistics', 
          undefined, 
          req
        );
      }
      
      // FIXED: Retrieve usage data from database (not in-memory store)
      // The database contains the actual usage records tracked by usageLogger middleware
      const usage = await database.getUsageStats(jwt.customerId);
      
      // Return usage statistics with proper structure for frontend
      return http.ok(res, { usage }, req);
    } catch (e: any) {
      // Concise error logging (no large payloads)
      if (process.env.LOG_LEVEL === 'error') {
        console.error('[Customer Usage] Error:', {
          errorCode: e.code || 'UNKNOWN',
          message: e.message,
          customerId: (req as any).customerJwt?.customerId,
          requestId: req.requestId,
        });
      }
      
      return http.serverError(
        res, 
        'USAGE_FETCH_FAILED', 
        'Failed to retrieve usage statistics', 
        undefined, 
        req
      );
    }
  });
}
