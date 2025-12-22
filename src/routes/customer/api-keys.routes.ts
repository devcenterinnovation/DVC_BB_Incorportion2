import { Router, type Request, type Response } from 'express';
import { authenticateCustomerJWT } from '../../middleware/customerJwt.middleware.js';
import { CustomerService } from '../../services/customer.service.js';
import { http } from '../../utils/error.util.js';

/**
 * ===================================================================
 * CUSTOMER API KEYS ROUTES
 * ===================================================================
 * Handles generation and management of customer API keys.
 * 
 * Authentication Flow Explained:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ TWO TYPES OF AUTHENTICATION:                                │
 * │                                                             │
 * │ 1. JWT Token (Portal Access)                               │
 * │    - Used for: These routes (managing API keys)            │
 * │    - Format: Authorization: Bearer <jwt_token>             │
 * │    - Obtained: After login                                 │
 * │                                                            │
 * │ 2. API Key (Business Operations)                          │
 * │    - Used for: Business API routes (name search, registration) │
 * │    - Format: Authorization: Token ck_fa80b8382479af...     │
 * │    - Obtained: Generated here via POST /api-keys           │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * Customer Flow:
 * 1. Customer logs in → Gets JWT token
 * 2. Customer uses JWT to call POST /customer/api-keys
 * 3. System generates API key (Token ck_...)
 * 4. Customer uses API key for business operations
 * 
 * Why Two Types?
 * - JWT = Short-lived session for portal (profile, key management)
 * - API Key = Long-lived token for programmatic business operations
 */

/**
 * Registers customer API key routes.
 * 
 * Routes:
 * - GET /customer/api-keys - List all API keys for authenticated customer
 * - POST /customer/api-keys - Generate new API key
 * - DELETE /customer/api-keys/:id - Revoke/delete an API key
 */
export function registerApiKeysRoutes(router: Router) {
  /**
   * GET /customer/api-keys
   * 
   * List all API keys belonging to the authenticated customer.
   * 
   * Authentication: JWT Bearer token required
   * 
   * Response:
   * - Array of API keys (without revealing the actual key value)
   * - Each key shows: id, name, prefix, status, usage count, created date
   * 
   * Note: Actual key values are NEVER returned after creation.
   * Only the prefix (first 12 chars) is shown for identification.
   */
  router.get('/api-keys', authenticateCustomerJWT, async (req: Request, res: Response) => {
    try {
      const jwt = (req as any).customerJwt;
      
      if (!jwt || !jwt.customerId) {
        return http.unauthorized(res, 'AUTHENTICATION_REQUIRED', 'Please login to view API keys', undefined, req);
      }
      
      // Fetch all API keys for this customer
      const keys = await CustomerService.listApiKeys(jwt.customerId);
      
      // Transform keys to hide sensitive information
      const safeKeys = keys.map(key => ({
        id: key.id,
        name: key.name || 'Unnamed Key',
        keyPrefix: key.keyPrefix || key.id.substring(0, 12),
        status: key.status || 'active',
        requestsUsed: key.requestsUsed || 0,
        requestsLimit: key.requestsLimit || 0,
        lastUsed: key.lastUsed || null,
        createdAt: key.createdAt || new Date().toISOString()
      }));
      
      return http.ok(res, { keys: safeKeys }, req);
    } catch (e: any) {
      // Concise error logging (no large payloads)
      if (process.env.LOG_LEVEL === 'error') {
        console.error('[Customer API Keys List] Error:', {
          errorCode: e.code || 'UNKNOWN',
          message: e.message,
          customerId: (req as any).customerJwt?.customerId,
          requestId: req.requestId,
        });
      }
      
      return http.serverError(res, 'API_KEYS_FETCH_FAILED', 'Failed to retrieve API keys', undefined, req);
    }
  });

  /**
   * POST /customer/api-keys
   * 
   * Generate a new API key for the authenticated customer.
   * 
   * Authentication: JWT Bearer token required
   * 
   * Request Body:
   * - name: (optional) Friendly name for the key (e.g., "Production Key")
   * - environment: (optional) 'test' or 'production' (default: 'production')
   * 
   * Response:
   * - token: The actual API key value (ONLY SHOWN ONCE!)
   * - keyPrefix: First 12 chars for identification
   * - id, name, status, createdAt
   * 
   * CRITICAL: The full API key is ONLY returned once at creation.
   * Customer must save it immediately. It cannot be retrieved later.
   */
  router.post('/api-keys', authenticateCustomerJWT, async (req: Request, res: Response) => {
    try {
      const jwt = (req as any).customerJwt;
      
      if (!jwt || !jwt.customerId) {
        return http.unauthorized(res, 'AUTHENTICATION_REQUIRED', 'Please login to create API keys', undefined, req);
      }
      
      const { name } = req.body || {};
      
      // Generate new API key for this customer using generateApiKey method
      const result = await CustomerService.generateApiKey({
        customerId: jwt.customerId,
        name: name || 'API Key'
      });
      
      // Return the full key ONCE (customer must save this!)
      return http.ok(res, {
        token: result.plainKey,           // Full API key (only time it's revealed!)
        keyPrefix: result.apiKey.keyPrefix,      // First 12 chars for UI display
        id: result.apiKey.id,
        name: result.apiKey.name,
        status: 'active',
        createdAt: new Date().toISOString(),
        warning: 'Save this key now - it will not be shown again!'
      }, req);
    } catch (e: any) {
      // Concise error logging (no large payloads)
      if (process.env.LOG_LEVEL === 'error') {
        console.error('[Customer API Key Create] Error:', {
          errorCode: e.code || 'UNKNOWN',
          message: e.message,
          customerId: (req as any).customerJwt?.customerId,
          requestId: req.requestId,
        });
      }
      
      return http.serverError(res, 'API_KEY_CREATION_FAILED', 'Failed to create API key', undefined, req);
    }
  });

  /**
   * DELETE /customer/api-keys/:id
   * 
   * Revoke/delete an API key.
   * 
   * Authentication: JWT Bearer token required
   * 
   * Path Parameters:
   * - id: The API key ID to revoke
   * 
   * Response:
   * - Success message confirming revocation
   * 
   * Notes:
   * - Revoked keys cannot be used for API calls
   * - Revocation is immediate
   * - Customer can only revoke their own keys
   */
  router.delete('/api-keys/:id', authenticateCustomerJWT, async (req: Request, res: Response) => {
    try {
      const jwt = (req as any).customerJwt;
      
      if (!jwt || !jwt.customerId) {
        return http.unauthorized(res, 'AUTHENTICATION_REQUIRED', 'Please login to delete API keys', undefined, req);
      }
      
      const keyId = req.params.id;
      
      if (!keyId) {
        return http.badRequest(res, 'MISSING_KEY_ID', 'API key ID is required', undefined, req);
      }
      
      // Verify the key belongs to this customer before revoking
      const key = await (await import('../../database/index.js')).database.getApiKey(keyId);
      
      if (!key || key.customerId !== jwt.customerId) {
        return http.notFound(res, 'KEY_NOT_FOUND', 'API key not found or does not belong to you', undefined, req);
      }
      
      // Revoke the API key
      await CustomerService.revokeApiKey(keyId);
      
      return http.ok(res, {
        revoked: true,
        keyId,
        message: 'API key revoked successfully'
      }, req);
    } catch (e: any) {
      // Concise error logging (no large payloads)
      if (process.env.LOG_LEVEL === 'error') {
        console.error('[Customer API Key Delete] Error:', {
          errorCode: e.code || 'UNKNOWN',
          message: e.message,
          customerId: (req as any).customerJwt?.customerId,
          keyId: req.params.id,
          requestId: req.requestId,
        });
      }
      
      return http.serverError(res, 'API_KEY_DELETION_FAILED', 'Failed to revoke API key', undefined, req);
    }
  });
}
