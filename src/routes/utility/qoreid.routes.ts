/**
 * QoreID Token Utility Routes
 * 
 * Standalone endpoints for QoreID token management.
 * These are utility routes and are NOT tracked for billing.
 */

import { Router, type Request, type Response } from 'express';
import { QoreIDTokenService } from '../../services/qoreid.token.service';
import { http } from '../../utils/error.util';

const router = Router();

/**
 * Get valid QoreID token
 * GET /utility/qoreid/token
 * 
 * Returns a valid QoreID token (cached or fresh)
 * This is the main endpoint other services should use
 */
router.get('/qoreid/token', async (req: Request, res: Response) => {
  try {
    console.log('[QoreID Route] Token requested');
    console.log('[QoreID Route] Starting token retrieval...');
    
    const token = await QoreIDTokenService.getValidQoreIDToken();
    console.log('[QoreID Route] Token retrieved successfully');
    
    const tokenInfo = await QoreIDTokenService.getTokenInfo();
    console.log('[QoreID Route] Token info retrieved');
    
    return http.ok(res, {
      accessToken: token,
      tokenType: 'Bearer',
      source: tokenInfo.isExpired ? 'fresh' : 'cached',
      expiresAt: tokenInfo.expiresAt
    }, req);
    
  } catch (error: any) {
    console.error('[QoreID Route] ===== ERROR DETAILS =====');
    console.error('[QoreID Route] Error name:', error.name);
    console.error('[QoreID Route] Error message:', error.message);
    console.error('[QoreID Route] Error stack:', error.stack);
    console.error('[QoreID Route] Full error:', error);
    console.error('[QoreID Route] =========================');
    
    return http.serverError(res, 'QOREID_TOKEN_FAILED', error.message || 'Unknown error occurred', {
      suggestion: 'Check QoreID credentials and API availability',
      errorType: error.name,
      errorStack: error.stack
    }, req);
  }
});

/**
 * Force refresh QoreID token
 * POST /utility/qoreid/refresh
 * 
 * Forces a fresh token request (bypasses cache)
 * Use this for testing or when you suspect token issues
 */
router.post('/qoreid/refresh', async (req: Request, res: Response) => {
  try {
    console.log('[QoreID Route] Force refresh requested');
    
    const token = await QoreIDTokenService.refreshToken();
    const tokenInfo = await QoreIDTokenService.getTokenInfo();
    
    return http.ok(res, {
      accessToken: token,
      tokenType: 'Bearer',
      source: 'fresh',
      expiresAt: tokenInfo.expiresAt,
      message: 'Token refreshed successfully'
    }, req);
    
  } catch (error: any) {
    console.error('[QoreID Route] Force refresh failed:', error.message);
    
    return http.serverError(res, 'QOREID_REFRESH_FAILED', error.message, {
      suggestion: 'Check QoreID credentials and API availability'
    }, req);
  }
});

/**
 * Get token status/info
 * GET /utility/qoreid/status
 * 
 * Returns information about current token without fetching new one
 * Useful for monitoring and debugging
 */
router.get('/qoreid/status', async (req: Request, res: Response) => {
  try {
    const tokenInfo = await QoreIDTokenService.getTokenInfo();
    const config = QoreIDTokenService.validateConfig();
    
    return http.ok(res, {
      hasToken: tokenInfo.hasToken,
      isExpired: tokenInfo.isExpired,
      expiresAt: tokenInfo.expiresAt,
      configValid: config.isValid,
      configErrors: config.errors,
      service: 'QoreID Token Management',
      endpoint: 'https://api.qoreid.com/token'
    }, req);
    
  } catch (error: any) {
    console.error('[QoreID Route] Status check failed:', error.message);
    
    return http.serverError(res, 'QOREID_STATUS_FAILED', error.message, undefined, req);
  }
});

/**
 * Health check for QoreID service
 * GET /utility/qoreid/health
 * 
 * Quick health check to see if QoreID service is reachable
 */
router.get('/qoreid/health', async (req: Request, res: Response) => {
  try {
    const config = QoreIDTokenService.validateConfig();
    
    if (!config.isValid) {
      return http.badRequest(res, 'QOREID_CONFIG_INVALID', 'QoreID service not configured', {
        errors: config.errors,
        required: ['QOREID_CLIENT_ID', 'QOREID_SECRET']
      }, req);
    }
    
    // Test if we can get a token (this will also test API connectivity)
    const tokenInfo = await QoreIDTokenService.getTokenInfo();
    
    return http.ok(res, {
      status: 'healthy',
      service: 'QoreID Token Service',
      configuration: 'valid',
      hasToken: tokenInfo.hasToken,
      lastCheck: new Date().toISOString()
    }, req);
    
  } catch (error: any) {
    return http.serverError(res, 'QOREID_HEALTH_FAILED', 'QoreID service health check failed', {
      error: error.message,
      suggestion: 'Check QoreID API availability and credentials'
    }, req);
  }
});

export default router;