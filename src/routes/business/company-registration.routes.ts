import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { http } from '../../utils/error.util';
import { validateCompanyRegistration } from '../../middleware/businessRegistration.middleware';
import { authenticateCustomer, trackUsage } from '../../middleware/customerAuth.middleware';
import { requireVerifiedBusiness } from '../../middleware/verificationCheck.middleware';
import { checkWalletBalance, chargeWallet } from '../../middleware/wallet.middleware';
// usageLogger removed - applied at app level in app.ts
import { documentsApiService } from '../../services/documentsApi.service';

/**
 * ===================================================================
 * COMPANY REGISTRATION ENDPOINT
 * ===================================================================
 * Route: POST /api/v1/company-registration
 * 
 * Purpose: Submit company registration request with witness information to Documents.com.ng
 * 
 * Authentication Flow (CRITICAL - READ THIS):
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Step 1: Customer → Your API                                 │
 * │   Header: Authorization: Token ck_fa80b8382479af...         │
 * │   Purpose: Authenticate customer to YOUR system             │
 * │                                                             │
 * │ Step 2: Your API → Documents.com.ng                        │
 * │   Header: Authorization: Token cac-6926adcaf30b1           │
 * │   Source: process.env.DOCUMENTS_AGENT_ID                   │
 * │   Purpose: Authenticate YOUR API to Documents.com.ng       │
 * │                                                             │
 * │ Result: Customer pays YOU, YOU pay Documents.com.ng        │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * When adding new endpoints with this flow:
 * 1. Use authenticateCustomer middleware to validate customer's API key
 * 2. Pass empty string '' to service methods (they read from .env)
 * 3. Service automatically uses process.env.DOCUMENTS_AGENT_ID
 * 4. Never pass customer's API key to external services
 * 
 * Middleware Chain:
 * 1. validateCompanyRegistration - Comprehensive input validation
 * 2. authenticateCustomer - Verify customer API key
 * 3. usageLogger - Log API usage for auditing
 * 4. trackUsage - Track for billing/quota enforcement
 */
export function registerCompanyRegistrationRoutes(router: Router) {
  router.post(
    '/company-registration',
    validateCompanyRegistration,  // Validate all required company registration fields
    authenticateCustomer,         // Customer API key authentication
    requireVerifiedBusiness,      // Verify customer is verified
    checkWalletBalance,           // Check wallet balance (returns 402 if insufficient)
    chargeWallet,                 // Setup response interception to charge on success
    trackUsage,                   // Track for billing and quota
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      
      try {
        // ============================================================
        // AUTHENTICATION NOTE (IMPORTANT):
        // ============================================================
        // At this point, customer's API key has been validated by authenticateCustomer middleware.
        // When we call Documents.com.ng below, the service will use:
        //   - YOUR Agent ID from process.env.DOCUMENTS_AGENT_ID
        //   - NOT the customer's API key
        // 
        // This separation allows you to:
        //   - Track which customer made the request (their API key)
        //   - Pay Documents.com.ng with YOUR account (your Agent ID)
        //   - Bill the customer based on usage (via trackUsage middleware)
        // 
        // This matches the authentication flow described in TRUTH.md
        // ============================================================
        
        // Create request context for tracing and logging
        const requestContext = {
          requestId: req.requestId || 'unknown',
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          timestamp: new Date().toISOString(),
          method: req.method,
          url: req.originalUrl,
        };

        // Submit company registration to Documents.com.ng
        // ============================================================
        // AGENT ID HANDLING:
        // The service method signature requires an agentId parameter,
        // but it's IGNORED. The service always uses YOUR Agent ID from:
        //   process.env.DOCUMENTS_AGENT_ID
        // 
        // We pass an empty string here to satisfy the signature.
        // ============================================================
        const response = await documentsApiService.submitCompanyRegistration(
          req.body,
          requestContext,
          '' // Empty string - service uses process.env.DOCUMENTS_AGENT_ID internally
        );

        const processingTime = Date.now() - startTime;

        // Determine success status from Documents.com.ng response
        // Status 100 or status_key 'success' indicates successful submission
        const isSuccess = response.status === 100 || 
                          String(response.status) === '100' || 
                          response.status_key === 'success';
        
        const statusCode = isSuccess ? 200 : 400;
        
        // Return standardized response with Documents.com.ng data embedded
        return res.status(statusCode).json({
          success: isSuccess,
          data: {
            status: response.status,
            status_key: response.status_key,
            status_response: response.status_response || response.message,
            message: response.message || response.status_response,
            ref: req.body.ref,
            processingTimeMs: processingTime,
          },
          requestId: req.requestId || 'unknown',
          timestamp: new Date().toISOString()
        });

      } catch (error: any) {
        // Concise error logging (no large payloads)
        if (process.env.LOG_LEVEL === 'error') {
          console.error('[Company Registration] Error:', {
            errorCode: error.response?.data?.status_key || 'UNKNOWN',
            message: error.message,
            ref: req.body?.ref,
            requestId: req.requestId,
          });
        }
        
        // If error has response data from external API (Documents.com.ng), include it
        if (error.response?.data) {
          return http.badGateway(
            res,
            error.response.data.status_key || 'EXTERNAL_API_ERROR',
            'Company registration failed',
            {
              message: error.response.data.status_response || 
                       error.response.data.message || 
                       'Failed to submit company registration',
              status: error.response.data.status,
              details: error.response.data
            },
            req
          );
        }
        
        // Generic external API error (no detailed response available)
        return http.badGateway(
          res,
          'EXTERNAL_API_ERROR',
          'Failed to submit company registration',
          { originalError: error.message },
          req
        );
      }
    })
  );
}
