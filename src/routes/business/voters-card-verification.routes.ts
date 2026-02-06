import { Router, type Request, type Response, type NextFunction } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { authenticateCustomer, trackUsage } from '../../middleware/customerAuth.middleware';
import { requireVerifiedBusiness } from '../../middleware/verificationCheck.middleware';
import { checkWalletBalance, chargeWallet } from '../../middleware/wallet.middleware';
import { validateContentType, sanitizeInput } from '../../middleware/validation.middleware';
import { QoreIDTokenService } from '../../services/qoreid.token.service';

/**
 * Register voters card verification routes
 * POST /business/identity/voters-card-verification/:vin
 */
export function registerVotersCardVerificationRoutes(router: Router): void {
  router.post(
    '/business/identity/voters-card-verification/:vin',
    validateContentType,
    sanitizeInput,
    authenticateCustomer,
    requireVerifiedBusiness,
    checkWalletBalance,   // Check wallet balance (returns 402 if insufficient)
    chargeWallet,         // Setup response interception to charge on success
    trackUsage,
    asyncHandler(handleVotersCardVerification)
  );
}

/**
 * POST /business/identity/voters-card-verification/:vin
 * Verify a voter's card (VIN) with name matching via QoreID
 * 
 * @route POST /business/identity/voters-card-verification/:vin
 * @param {string} vin - The Voter Identification Number (VIN)
 * @body {string} firstname - First name to match
 * @body {string} lastname - Last name to match
 * @returns {object} Verification result from QoreID
 */
async function handleVotersCardVerification(req: Request, res: Response): Promise<void> {
  const requestId = req.headers['x-request-id'] as string || `vc-${Date.now()}`;
  const startTime = Date.now();

  try {
    const { vin } = req.params;
    const { firstname, lastname, dob } = req.body;

    // Validate required fields
    if (!vin) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_VIN',
          message: 'VIN (Voter Identification Number) is required',
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
    const qoreidUrl = `https://api.qoreid.com/v1/ng/identities/vin/${vin}`;
    
    // Build QoreID payload - only include fields that are provided
    const qoreidPayload: Record<string, string> = {
      firstname: firstname,
      lastname: lastname,
    };
    
    // Add dob only if provided (some VINs may require it)
    if (dob) {
      qoreidPayload.dob = dob;
    }

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
            message: 'VIN not found or invalid',
            details: {
              vin: vin.substring(0, 6) + '***',
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
            code: 'VOTERS_CARD_VERIFICATION_FAILED',
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
          code: 'VOTERS_CARD_VERIFICATION_FAILED',
          message: qoreidData.message || 'Verification failed',
          details: qoreidData,
        },
        requestId,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Extract and format the response
    const votersCardData = qoreidData.vin || qoreidData;
    const processingTimeMs = Date.now() - startTime;

    // Build the summary
    const summary = {
      voters_card_check: {
        status: 'verified',
        fieldMatches: {
          firstname: votersCardData.firstname?.toUpperCase() === firstname.toUpperCase(),
          lastname: votersCardData.lastname?.toUpperCase() === lastname.toUpperCase(),
        },
      },
    };

    // Return successful response
    res.status(200).json({
      success: true,
      data: {
        id: qoreidData.id,
        voters_card: {
          vin: votersCardData.vin || vin,
          firstname: votersCardData.firstname,
          lastname: votersCardData.lastname,
          middlename: votersCardData.middlename || '',
          birthdate: votersCardData.birthdate || votersCardData.dob,
          gender: votersCardData.gender,
          occupation: votersCardData.occupation,
          pollingUnit: votersCardData.pollingUnit || votersCardData.polling_unit,
          state: votersCardData.state,
          lga: votersCardData.lga,
          message: 'Success',
        },
        summary,
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          customerId: (req as any).customer?.id || 'unknown',
          service: 'voters-card-verification',
          provider: 'qoreid',
          processingTimeMs,
        },
      },
      requestId,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Voters Card Verification Error:', error);

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
        code: 'VOTERS_CARD_VERIFICATION_ERROR',
        message: error.message || 'An unknown error has occurred',
      },
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}

// Default export router
const votersCardRouter = Router();
registerVotersCardVerificationRoutes(votersCardRouter);
export default votersCardRouter;
