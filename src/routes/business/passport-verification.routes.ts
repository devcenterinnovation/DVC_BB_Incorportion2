/**
 * Passport Verification Routes (QoreID)
 * 
 * Verifies passport details without requiring face verification/image.
 * Uses QoreID Passport Verification API endpoint.
 * 
 * Flow:
 * 1) Customer authenticates with API key (Authorization: Token ck_...)
 * 2) Our API obtains QoreID Bearer token internally (never exposed to customer)
 * 3) Our API calls QoreID endpoint: /v1/ng/identities/passport/{passportNumber}
 * 4) Return QoreID response + metadata
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { authenticateCustomer, trackUsage } from '../../middleware/customerAuth.middleware.js';
import { requireVerifiedBusiness } from '../../middleware/verificationCheck.middleware.js';
import { checkWalletBalance, chargeWallet } from '../../middleware/wallet.middleware.js';
import { validateContentType, sanitizeInput } from '../../middleware/validation.middleware.js';
import { QoreIDTokenService } from '../../services/qoreid.token.service.js';

const QOREID_BASE_URL = (process.env.QOREID_API_URL || 'https://api.qoreid.com').replace(/\/$/, '');

/**
 * Register passport verification routes
 * POST /business/identity/passport-verification/:passportNumber
 */
export function registerPassportVerificationRoutes(router: Router): void {
  router.post(
    '/business/identity/passport-verification/:passportNumber',
    validateContentType,
    sanitizeInput,
    authenticateCustomer,
    requireVerifiedBusiness,
    checkWalletBalance,   // Check wallet balance (returns 402 if insufficient)
    chargeWallet,         // Setup response interception to charge on success
    trackUsage,
    asyncHandler(handlePassportVerification)
  );
}

/**
 * POST /business/identity/passport-verification/:passportNumber
 * Verify a passport with name matching via QoreID (no image required)
 * 
 * @route POST /business/identity/passport-verification/:passportNumber
 * @param {string} passportNumber - The passport number to verify
 * @body {string} firstname - First name to match
 * @body {string} lastname - Last name to match
 * @returns {object} Verification result from QoreID
 */
async function handlePassportVerification(req: Request, res: Response): Promise<void> {
  const requestId = req.headers['x-request-id'] as string || `pv-${Date.now()}`;
  const startTime = Date.now();

  try {
    const { passportNumber } = req.params;
    const { firstname, lastname } = req.body;

    // Validate required fields
    if (!passportNumber) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PASSPORT_NUMBER',
          message: 'Passport number is required',
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (!firstname || !lastname) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'firstname and lastname are required',
          details: {
            firstname: !firstname ? 'missing' : 'provided',
            lastname: !lastname ? 'missing' : 'provided',
          },
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Get QoreID token
    const token = await QoreIDTokenService.getValidQoreIDToken();

    // Prepare request to QoreID
    const qoreidUrl = `${QOREID_BASE_URL}/v1/ng/identities/passport/${passportNumber}`;
    
    // Build QoreID payload
    const qoreidPayload = {
      firstname: firstname,
      lastname: lastname,
    };

    // Call QoreID API
    const qoreidResponse = await fetch(qoreidUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(qoreidPayload),
    });

    const qoreidData = await qoreidResponse.json() as any;

    // Handle QoreID error responses
    if (!qoreidResponse.ok) {
      const statusCode = qoreidResponse.status;

      // Handle specific QoreID errors
      if (statusCode === 404) {
        res.status(404).json({
          success: false,
          error: {
            code: 'IDENTITY_NOT_FOUND',
            message: 'Passport number not found or invalid',
            details: {
              passportNumber: passportNumber.substring(0, 3) + '***',
            },
          },
          requestId,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      if (statusCode === 403) {
        res.status(500).json({
          success: false,
          error: {
            code: 'PASSPORT_VERIFICATION_FAILED',
            message: qoreidData.message || 'Forbidden resource',
            details: {
              statusCode,
              details: qoreidData,
            },
          },
          requestId,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Generic error
      res.status(500).json({
        success: false,
        error: {
          code: 'PASSPORT_VERIFICATION_FAILED',
          message: qoreidData.message || 'Verification failed',
          details: qoreidData,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Extract and format the response
    const passportData = qoreidData.passport || qoreidData;
    const processingTimeMs = Date.now() - startTime;

    // Build the summary
    const summary = {
      passport_check: {
        status: 'verified',
        fieldMatches: {
          firstname: passportData.firstname?.toUpperCase() === firstname.toUpperCase(),
          lastname: passportData.lastname?.toUpperCase() === lastname.toUpperCase(),
        },
      },
    };

    // Return successful response
    res.status(200).json({
      success: true,
      data: {
        id: qoreidData.id,
        passport: {
          passportNumber: passportData.passportNo || passportNumber,
          firstname: passportData.firstname,
          lastname: passportData.lastname,
          middlename: passportData.middlename || '',
          birthdate: passportData.birthdate || passportData.dob,
          gender: passportData.gender,
          issuedDate: passportData.issued_date || passportData.issuedDate,
          expiryDate: passportData.expiry_date || passportData.expiryDate,
          issuingOrganization: passportData.issuingOrganization,
          message: 'Success',
        },
        summary,
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          customerId: (req as any).customer?.id || 'unknown',
          service: 'passport-verification',
          provider: 'qoreid',
          processingTimeMs,
        },
      },
      requestId,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Passport Verification Error:', error);

    // Handle network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      res.status(503).json({
        success: false,
        error: {
          code: 'VERIFICATION_SERVICE_UNAVAILABLE',
          message: 'Verification service is currently unavailable',
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'PASSPORT_VERIFICATION_ERROR',
        message: error.message || 'An unknown error has occurred',
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}

// Default export router
const passportVerificationRouter = Router();
registerPassportVerificationRoutes(passportVerificationRouter);
export default passportVerificationRouter;
