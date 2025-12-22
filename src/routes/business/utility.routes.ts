import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { authenticateCustomer, trackUsage } from '../../middleware/customerAuth.middleware.js';
// usageLogger removed - applied at app level in app.ts
import { CustomerService } from '../../services/customer.service.js';
import { cacStoreProductsService } from '../../services/cacStoreProducts.service.js';
import { http } from '../../utils/error.util.js';

/**
 * ===================================================================
 * BUSINESS UTILITY ROUTES
 * ===================================================================
 * 
 * Handles miscellaneous business API utilities.
 * 
 * These routes provide utility functions for the business API:
 * - API key authentication testing
 * - API documentation
 * - CAC store products listing
 * 
 * Routes:
 * - GET /business/ping - Test API key authentication
 * - GET /docs - API documentation
 * - GET /business/cac-store-products - List CAC store products
 */

/**
 * Registers business utility routes.
 * 
 * @param router - Express router instance
 */
export function registerUtilityRoutes(router: Router) {
  /**
   * GET /business/ping
   * 
   * Ping endpoint to verify API key authentication.
   * 
   * This endpoint allows customers to test their API key without
   * consuming any API credits or making external API calls.
   * 
   * Useful for:
   * - Testing API key validity
   * - Checking customer account status
   * - Verifying API key configuration
   * - Health checks from customer systems
   * 
   * Authentication: Customer API key required (Token ck_xxx or X-API-Key header)
   * 
   * Request Headers:
   * - Authorization: Token <API_KEY>
   * OR
   * - X-API-Key: <API_KEY>
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "message": "OK",
   *     "customerId": "cust_123",
   *     "keyId": "key_456",
   *     "status": "active"
   *   }
   * }
   * 
   * Error Responses:
   * - 401 MISSING_TOKEN: No API key provided
   * - 401 INVALID_API_KEY: Invalid or expired API key
   * - 403 ACCOUNT_OR_KEY_INACTIVE: Customer or API key is not active
   */
  router.get('/business/ping', async (req: Request, res: Response) => {
    // Accept Authorization: Token ck_... or X-API-Key: ck_...
    const auth = req.headers.authorization || '';
    const xKey = req.headers['x-api-key'] || '';
    let rawToken = '';

    if (auth.startsWith('Token ')) rawToken = auth.slice(6).trim();
    else if (typeof xKey === 'string' && xKey.trim()) rawToken = xKey.trim();

    if (!rawToken) {
      return http.unauthorized(res, 'MISSING_TOKEN', 'Provide Authorization: Token <API_KEY> or X-API-Key header', undefined, req);
    }

    try {
      const result = await CustomerService.verifyApiKey(rawToken);
      if (!result) {
        return http.unauthorized(res, 'INVALID_API_KEY', 'Invalid or expired API key', undefined, req);
      }
      
      const { customer, apiKey } = result;
      
      if (customer.status !== 'active' || apiKey.status !== 'active') {
        return http.forbidden(res, 'ACCOUNT_OR_KEY_INACTIVE', 'Customer or API key is not active', undefined, req);
      }
      
      (req as any).customer = customer;
      (req as any).apiKey = apiKey;
      
      return http.ok(res, { 
        message: 'OK', 
        customerId: customer.id, 
        keyId: apiKey.id, 
        status: apiKey.status 
      }, req);
    } catch (error) {
      return http.serverError(res, 'CUSTOMER_AUTH_ERROR', 'Failed to authenticate customer', undefined, req);
    }
  });

  /**
   * GET /docs
   * 
   * API documentation endpoint.
   * 
   * Returns comprehensive API documentation including:
   * - Available endpoints
   * - Authentication methods
   * - Request/response formats
   * - Usage examples
   * 
   * Authentication: None required (public documentation)
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "title": "Business API Middleware",
   *     "version": "1.0.0",
   *     "description": "...",
   *     "endpoints": { ... },
   *     "authentication": { ... }
   *   }
   * }
   */
  router.get(
    '/docs',
    asyncHandler(async (req: Request, res: Response) => {
      return http.ok(res, {
        title: 'Business API Middleware',
        version: '1.0.0',
        description: 'Enterprise-grade middleware API for CAC.gov.ng business name search',
        endpoints: {
          'POST /api/v1/business/name-search': 'Search for business names (authenticated)',
          'POST /api/v1/business/name-registration': 'Register a business name (authenticated)',
          'POST /api/v1/business/company-registration': 'Register a company (authenticated)',
          'GET /api/v1/business/status/:referenceId': 'Check registration status (authenticated)',
          'GET /api/v1/health': 'Health check (public)',
          'GET /api/v1/business/ping': 'API key test (authenticated)',
          'GET /api/v1/business/cac-store-products': 'List CAC products (authenticated)',
          'GET /api/v1/docs': 'API documentation (public)',
          'GET /api/v1/monitoring/stats': 'API statistics (admin only)',
          'GET /api/v1/monitoring/rate-limit': 'Rate limit status (admin only)',
          'GET /api/v1/audit/logs': 'Audit logs (admin only)',
          'POST /api/v1/admin/reset-circuit-breaker': 'Reset external API circuit breaker (admin only)'
        },
        features: {
          authentication: 'API key-based authentication for customers, JWT for admins',
          rate_limiting: 'Configurable rate limits per customer plan',
          usage_tracking: 'Comprehensive usage tracking for both admin and customer requests',
          error_handling: 'Standardized error responses with request IDs'
        },
        authentication: {
          customer: {
            type: 'API Key',
            header: 'Authorization: Token <customer_api_key>',
            description: 'Use API key received from customer portal'
          },
          admin: {
            type: 'Bearer JWT',
            header: 'Authorization: Bearer <admin_jwt>',
            description: 'Use JWT token from admin login'
          }
        },
        links: {
          openapi: '/api/v1/openapi.json',
          support: 'https://support.example.com',
          portal: 'https://portal.example.com'
        }
      }, req);
    })
  );

  /**
   * GET /business/cac-store-products
   * 
   * Get all products from CAC Store.
   * 
   * Returns a list of all available products/services from the
   * CAC (Corporate Affairs Commission) store.
   * 
   * This endpoint is useful for:
   * - Displaying available CAC services to customers
   * - Building product selection interfaces
   * - Checking product availability and pricing
   * 
   * Authentication: Customer API key required
   * Usage: Tracked and logged for billing
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "products": [
   *       {
   *         "id": "prod_123",
   *         "name": "Business Name Registration",
   *         "description": "...",
   *         "price": 10000
   *       }
   *     ],
   *     "count": 15
   *   }
   * }
   * 
   * Error Responses:
   * - 401 UNAUTHORIZED: Invalid or missing API key
   * - 502 EXTERNAL_API_ERROR: Failed to fetch from CAC API
   */
  router.get(
    '/business/cac-store-products',
    authenticateCustomer,
    // usageLogger applied at app level, no need to duplicate here
    trackUsage,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const products = await cacStoreProductsService.getAllProducts();
        
        return http.ok(res, {
          products,
          count: products.length
        }, req);
      } catch (error: any) {
        console.error('CAC Store products fetch error:', error.message);
        
        return http.badGateway(
          res,
          'EXTERNAL_API_ERROR',
          'Failed to fetch CAC store products',
          { originalError: error.message },
          req
        );
      }
    })
  );
}
