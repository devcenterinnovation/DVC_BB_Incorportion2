import { Router, type Request, type Response } from 'express';
import { authenticateCustomerJWT } from '../../middleware/customerJwt.middleware';
import { CustomerStore } from '../../services/customerPortal.store';
import { database } from '../../database/index';
import { http } from '../../utils/error.util';

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
  
  // DEBUG: Test endpoint to manually insert usage record
  router.post('/usage/test-insert', authenticateCustomerJWT, async (req: Request, res: Response) => {
    try {
      const jwt = (req as any).customerJwt;
      
      if (!jwt || !jwt.customerId) {
        return http.unauthorized(res, 'NO_JWT', 'No JWT found');
      }
      
      console.log('[TEST] Inserting test usage record for customerId:', jwt.customerId);
      
      const now = new Date();
      const billingPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      
      await database.recordUsage({
        customerId: jwt.customerId,
        keyId: 'test-key',
        endpoint: '/test/endpoint',
        method: 'POST',
        statusCode: 200,
        responseTimeMs: 100,
        billingPeriod,
        cost: 0
      });
      
      console.log('[TEST] ✅ Test record inserted successfully!');
      
      // Now fetch and return
      const usage = await database.getUsageStats(jwt.customerId);
      console.log('[TEST] Usage after insert:', JSON.stringify(usage));
      
      return http.ok(res, { 
        message: 'Test record inserted',
        customerId: jwt.customerId,
        usage 
      }, req);
    } catch (e: any) {
      console.error('[TEST] ❌ Error:', e);
      return http.serverError(res, 'TEST_FAILED', e.message);
    }
  });
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
      
      console.log('========================================');
      console.log('[USAGE-API] GET /customer/usage called');
      console.log('[USAGE-API] JWT payload:', jwt ? JSON.stringify(jwt) : 'undefined');
      console.log('[USAGE-API] Customer ID from JWT:', jwt?.customerId);
      console.log('========================================');
      
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
      console.log('[USAGE-API] Fetching usage stats for customerId:', jwt.customerId);
      const usage = await database.getUsageStats(jwt.customerId);
      console.log('[USAGE-API] Usage stats returned:', JSON.stringify(usage));
      console.log('========================================');
      
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
