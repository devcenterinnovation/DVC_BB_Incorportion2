/**
 * Passport Face Verification Routes
 * 
 * Verifies identity by comparing passport photo with provided photo.
 * Uses QoreID Passport Face Verification API endpoint.
 * 
 * Pricing: ₦200 per verification
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { authenticateCustomer, trackUsage } from '../../middleware/customerAuth.middleware.js';
import { requireVerifiedBusiness } from '../../middleware/verificationCheck.middleware.js';
import { checkWalletBalance, chargeWallet } from '../../middleware/wallet.middleware.js';
import { QoreIDTokenService } from '../../services/qoreid.token.service.js';
import { http } from '../../utils/error.util.js';
import { validateContentType, sanitizeInput } from '../../middleware/validation.middleware.js';

const router = Router();

/**
 * Helper middleware to authenticate customer API keys.
 * Following the same pattern as business name registration.
 * 
 * Authentication flow:
 * 1. Extracts "Token ck_..." from Authorization header
 * 2. Validates the API key format
 * 3. Lightweight gate for business-specific routes
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
  
  // Basic format check passed
  // Actual validation happens in trackUsage middleware
  next();
}

// QoreID Face Verification endpoint
const QOREID_FACE_VERIFICATION_URL = 'https://api.qoreid.com/v1/ng/identities/face-verification/passport';

interface FaceVerificationRequest {
  idNumber: string;        // Passport number
  firstName: string;
  lastname: string;        // Note: lowercase as QoreID expects
  photoBase64?: string;    // Base64 encoded image
  photoUrl?: string;       // OR URL to image
}

interface FaceVerificationResponse {
  summary: {
    face_verification: {
      status: string;
      confidence?: number;
    };
  };
  identity?: {
    firstName?: string;
    lastName?: string;
    idNumber?: string;
  };
  [key: string]: any;
}

/**
 * Registers face verification routes.
 * 
 * Public route:
 * POST /api/v1/business/identity/passport-face-verification
 * 
 * Backward compatible alias:
 * POST /api/v1/business/identity/face-verification
 * 
 * Purpose: Verify identity by comparing passport photo with provided photo
 * Uses QoreID API for face verification
 * 
 * Authentication: Customer API key (Token ck_...)
 * Pricing: ₦200 per verification
 */
export function registerPassportFaceVerificationRoutes(router: Router) {
  const handler = async (req: Request, res: Response) => {
    const requestId = req.requestId || `req_${Date.now()}`;
    const requestTimestamp = new Date().toISOString();

    try {
      const customer = (req as any).customer;
      if (!customer?.id) {
        return http.unauthorized(
          res,
          'MISSING_CUSTOMER_CONTEXT',
          'Customer authentication failed (no customer context). Ensure you pass Authorization: Token ck_...'
        );
      }

      const { idNumber, firstName, lastname, photoBase64, photoUrl } = req.body as FaceVerificationRequest;

      if (!idNumber || !firstName || !lastname) {
        return http.badRequest(
          res,
          'MISSING_REQUIRED_FIELDS',
          'Missing required fields: idNumber, firstName, lastname',
          {
            required: ['idNumber', 'firstName', 'lastname'],
            received: { idNumber: !!idNumber, firstName: !!firstName, lastname: !!lastname }
          },
          req
        );
      }

      if (!photoBase64 && !photoUrl) {
        return http.badRequest(
          res,
          'MISSING_IMAGE',
          'Must provide either photoBase64 or photoUrl',
          { required: 'One of: photoBase64, photoUrl', received: 'Neither provided' },
          req
        );
      }

      const qoreidRequestBody: any = {
        idNumber: idNumber.trim(),
        firstName: firstName.trim(),
        lastname: lastname.trim()
      };

      // Choose ONE image option: prioritize base64 if present
      if (photoBase64) qoreidRequestBody.photoBase64 = photoBase64;
      else if (photoUrl) qoreidRequestBody.photoUrl = photoUrl;

      console.log('[PassportFaceVerification] Processing request:', {
        customerId: customer.id,
        idNumber: idNumber.substring(0, 4) + '***',
        hasPhotoBase64: !!photoBase64,
        hasPhotoUrl: !!photoUrl,
        requestId
      });

      const qoreidToken = await QoreIDTokenService.getValidQoreIDToken();

      let qoreidResponse: globalThis.Response;
      try {
        qoreidResponse = await fetch(QOREID_FACE_VERIFICATION_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${qoreidToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(qoreidRequestBody)
        });
      } catch (error: any) {
        console.error('[PassportFaceVerification] Network error calling QoreID:', error.message);
        return http.serverError(
          res,
          'VERIFICATION_SERVICE_UNAVAILABLE',
          'Verification service is currently unavailable',
          { suggestion: 'Please try again later' },
          req
        );
      }

      const responseText = await qoreidResponse.text();
      let qoreidData: any;
      try {
        qoreidData = JSON.parse(responseText);
      } catch {
        console.error('[PassportFaceVerification] Failed to parse QoreID response:', responseText);
        return http.serverError(
          res,
          'INVALID_VERIFICATION_RESPONSE',
          'Received invalid response from verification service',
          undefined,
          req
        );
      }

      if (!qoreidResponse.ok) {
        console.error('[PassportFaceVerification] QoreID API error:', qoreidResponse.status, qoreidData);

        if (qoreidResponse.status === 400) {
          return http.badRequest(
            res,
            'INVALID_VERIFICATION_REQUEST',
            qoreidData.message || 'Invalid verification request',
            { details: qoreidData },
            req
          );
        }

        if (qoreidResponse.status === 404) {
          return http.notFound(
            res,
            'IDENTITY_NOT_FOUND',
            'Passport number not found or invalid',
            { idNumber: idNumber.substring(0, 4) + '***' },
            req
          );
        }

        return http.serverError(
          res,
          'VERIFICATION_FAILED',
          qoreidData.message || 'Passport face verification failed',
          { statusCode: qoreidResponse.status },
          req
        );
      }

      return http.ok(
        res,
        {
          ...qoreidData,
          metadata: {
            requestId,
            timestamp: requestTimestamp,
            customerId: customer.id,
            service: 'passport-face-verification',
            provider: 'qoreid'
          }
        },
        req
      );
    } catch (error: any) {
      console.error('[PassportFaceVerification] Unexpected error:', error);
      return http.serverError(
        res,
        'PASSPORT_FACE_VERIFICATION_ERROR',
        'An unexpected error occurred during passport face verification',
        { error: error.message },
        req
      );
    }
  };

  const middlewareChain = [
    validateContentType,
    sanitizeInput,
    requireCustomerApiKey,
    authenticateCustomer,
    requireVerifiedBusiness,      // Ensure customer is verified
    checkWalletBalance,           // Check wallet balance (returns 402 if insufficient)
    chargeWallet,                 // Setup response interception to charge on success
    trackUsage,
    asyncHandler(handler)
  ] as const;

  // Canonical route (correctly named)
  router.post('/business/identity/passport-face-verification', ...middlewareChain);
}

// For backward compatibility, export old function name too
export const registerFaceVerificationRoutes = registerPassportFaceVerificationRoutes;

// Default export router includes both canonical and alias routes
const passportFaceVerificationRouter = Router();
registerPassportFaceVerificationRoutes(passportFaceVerificationRouter);
export default passportFaceVerificationRouter;
