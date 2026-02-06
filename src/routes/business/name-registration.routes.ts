import { Router, type Request, type Response, type NextFunction } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { http } from '../../utils/error.util';
import config from '../../config/index';
import { validateContentType, sanitizeInput } from '../../middleware/validation.middleware';
import { validateBusinessRegistration, rateLimitBusinessRegistration } from '../../middleware/businessRegistration.middleware';
import { authenticateCustomer, trackUsage } from '../../middleware/customerAuth.middleware';
import { requireVerifiedBusiness } from '../../middleware/verificationCheck.middleware';
import { checkWalletBalance, chargeWallet } from '../../middleware/wallet.middleware';
import { documentsApiService } from '../../services/documentsApi.service';
import type { BusinessRegistrationRequest } from '../../types/api';

/**
 * Helper middleware to authenticate customer API keys.
 * This is a local helper used within business registration flows.
 * 
 * Authentication flow:
 * 1. Extracts "Token ck_..." from Authorization header
 * 2. Validates the API key format and status
 * 3. Attaches customer and apiKey to req for downstream use
 */
async function requireCustomerApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Token ')) {
    return http.unauthorized(
      res,
      'MISSING_API_KEY',
      'Customer API key is required. Format: Authorization: Token ck_...',
      undefined,
      req
    );
  }
  
  const apiKey = authHeader.substring(6); // Remove "Token " prefix
  
  if (!apiKey || !apiKey.startsWith('ck_')) {
    return http.unauthorized(
      res,
      'INVALID_API_KEY_FORMAT',
      'Invalid API key format. Expected: ck_...',
      undefined,
      req
    );
  }
  
  // In real implementation, validate the key against database
  // For now, basic format check passed
  // The actual validation happens in authenticateCustomer middleware
  // This is a lightweight gate for business-specific routes
  
  next();
}

/**
 * Registers business name registration routes.
 * 
 * Public route:
 * POST /api/v1/business/name-registration
 * 
 * Purpose: Submit business name registration request to Documents.com.ng
 * Handles complete registration workflow including document uploads and validation.
 * 
 * Authentication: Customer API key (Token ck_...)
 * Rate limiting: Dynamic per customer plan
 */
export function registerNameRegistrationRoutes(router: Router) {
  router.post(
    '/business/name-registration',
    // Middleware chain for commercial-grade validation and security
    validateContentType,       // Ensure JSON content-type
    sanitizeInput,             // Sanitize inputs to prevent injection
    authenticateCustomer,      // Use standard customer auth (FIXED)
    requireVerifiedBusiness,   // Verify customer is verified
    checkWalletBalance,        // Check wallet balance (returns 402 if insufficient)
    chargeWallet,              // Setup response interception to charge on success
    trackUsage,                // Track API usage for billing/quota
    rateLimitBusinessRegistration, // Dynamic rate limiting per plan
    validateBusinessRegistration,  // Comprehensive input validation (all required fields)
    asyncHandler(async (req: Request, res: Response) => {
      const startTime = Date.now();
      
      try {
        // ============================================================
        // AUTHENTICATION NOTE (IMPORTANT):
        // ============================================================
        // At this point, customer's API key has been validated by middleware.
        // When we call Documents.com.ng below, the service will use:
        //   - YOUR Agent ID from process.env.DOCUMENTS_AGENT_ID
        //   - NOT the customer's API key
        // 
        // This separation allows you to:
        //   - Track which customer made the request (their API key)
        //   - Pay Documents.com.ng with YOUR account (your Agent ID)
        //   - Bill the customer based on usage
        // ============================================================
        
        // Extract registration data (already validated by middleware)
        const registrationData: BusinessRegistrationRequest = req.body;
        
        // Generate unique submission ID for tracking
        const submissionId = `DOC_${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')}_${Math.random().toString(36).substr(2, 6)}`;
        
        // Create request context for logging and tracing
        const requestContext = {
          requestId: req.requestId || 'unknown',
          userId: req.user?.id,
          clientId: req.clientId,
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          timestamp: new Date().toISOString(),
          method: req.method,
          url: req.originalUrl,
          correlationId: req.correlationId,
        };
        
        // Validation checks (middleware has already validated these)
        const validationChecks = {
          requiredFieldsValid: true,
          dateFormatValid: true,
          emailFormatValid: true,
          phoneFormatValid: true,
          base64ImagesValid: true,
          imageFormatValidation: true,
        };
        
        // Submit to Documents.com.ng API
        // ============================================================
        // AGENT ID HANDLING:
        // The service method signature requires an agentId parameter,
        // but it's IGNORED. The service always uses YOUR Agent ID from:
        //   process.env.DOCUMENTS_AGENT_ID
        // 
        // We pass an empty string here to satisfy the signature.
        // ============================================================
        const documentsResponse = await documentsApiService.submitBusinessRegistration(
          registrationData,
          requestContext,
          '' // Empty string - service uses process.env.DOCUMENTS_AGENT_ID internally
        );
        
        const processingTime = Date.now() - startTime;
        
        // Return standardized response with Documents.com.ng response embedded
        return http.ok(res, {
          status: documentsResponse.status,
          status_key: documentsResponse.status_key,
          status_response: documentsResponse.status_response || documentsResponse.message,
          message: documentsResponse.message || documentsResponse.status_response,
          ref: registrationData.ref,
          processingTimeMs: processingTime,
        }, req);
        
      } catch (error: any) {
        const processingTime = Date.now() - startTime;
        
        // Concise error logging (no large payloads)
        if (process.env.LOG_LEVEL === 'error') {
          console.error('[Business Registration] Error:', {
            errorCode: error.code || 'UNKNOWN',
            message: error.message,
            requestId: req.requestId,
            ref: req.body?.ref,
            durationMs: processingTime,
          });
        }
        
        // Validation errors (fallback - middleware should catch these)
        if (error.message && (
          error.message.includes('is required') ||
          error.message.includes('format') ||
          error.message.includes('Invalid')
        )) {
          return http.badRequest(
            res,
            'VALIDATION_ERROR',
            'Registration validation failed',
            {
              originalError: error.message,
              field: error.message.split(' ')[0],
            },
            req
          );
        }
        
        // External API errors
        if (error.name === 'ExternalApiError') {
          if (error.message && error.message.includes('Documents.com.ng')) {
            return http.badGateway(
              res,
              'CONNECTION_ERROR',
              'Failed to connect to Documents.com.ng API',
              {
                originalError: 'Network connection failed',
                service: 'Documents.com.ng',
              },
              req
            );
          } else {
            return http.badGateway(
              res,
              'EXTERNAL_API_ERROR',
              'External API processing failed',
              {
                originalError: error.message,
                service: 'Documents.com.ng',
              },
              req
            );
          }
        }
        
        // General internal error
        return http.serverError(
          res,
          'INTERNAL_ERROR',
          'Internal server error occurred',
          {
            originalError: config.isProduction ? 'Internal server error' : error.message,
          },
          req
        );
      }
    })
  );
}
