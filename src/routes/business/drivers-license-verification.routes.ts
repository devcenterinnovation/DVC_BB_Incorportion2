/**
 * Drivers License Face Verification Routes (QoreID)
 *
 * Source: TRUTH4.md
 *
 * Flow:
 * 1) Customer authenticates to OUR API with API key (Authorization: Token ck_...)
 * 2) Our API obtains QoreID Bearer token internally (never exposed to customer)
 * 3) Our API calls QoreID endpoint: /v1/ng/identities/face-verification/drivers-license
 * 4) Return QoreID response + metadata
 *
 * NOTE:
 * - Choose ONE image option: photoBase64 OR photoUrl (do not send empty fields)
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { authenticateCustomer, trackUsage } from '../../middleware/customerAuth.middleware.js';
import { requireVerifiedBusiness } from '../../middleware/verificationCheck.middleware.js';
import { checkWalletBalance, chargeWallet } from '../../middleware/wallet.middleware.js';
import { validateContentType, sanitizeInput } from '../../middleware/validation.middleware.js';
import { QoreIDTokenService } from '../../services/qoreid.token.service.js';
import { http } from '../../utils/error.util.js';

const QOREID_BASE_URL = (process.env.QOREID_API_URL || 'https://api.qoreid.com').replace(/\/$/, '');
const QOREID_DRIVERS_LICENSE_FACE_URL = `${QOREID_BASE_URL}/v1/ng/identities/face-verification/drivers-license`;

/**
 * Token-only API key gate (matches other business routes)
 */
async function requireCustomerApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Token ')) {
    return http.unauthorized(
      res,
      'MISSING_API_KEY',
      'Customer API key is required. Format: Authorization: Token ck_...'
    );
  }

  const apiKey = authHeader.substring('Token '.length).trim();
  if (!apiKey.startsWith('ck_')) {
    return http.unauthorized(
      res,
      'INVALID_API_KEY_FORMAT',
      'Invalid API key format. Expected: ck_...'
    );
  }

  return next();
}

export interface DriversLicenseFaceVerificationRequest {
  idNumber: string;
  firstName: string;
  // TRUTH4 shows both lastname and lastName. We accept both but send lastname.
  lastname?: string;
  lastName?: string;
  photoBase64?: string;
  photoUrl?: string;
}

export function registerDriversLicenseVerificationRoutes(router: Router) {
  const handler = async (req: Request, res: Response) => {
    const requestId = req.requestId || `req_${Date.now()}`;
    const requestTimestamp = new Date().toISOString();

    const customer = (req as any).customer;
    if (!customer?.id) {
      return http.unauthorized(
        res,
        'MISSING_CUSTOMER_CONTEXT',
        'Customer authentication failed (no customer context). Ensure you pass Authorization: Token ck_...'
      );
    }

    const body = req.body as DriversLicenseFaceVerificationRequest;

    const idNumber = (body.idNumber || '').trim();
    const firstName = (body.firstName || '').trim();
    const lastNameValue = ((body.lastname || body.lastName) || '').trim();

    if (!idNumber || !firstName || !lastNameValue) {
      return http.badRequest(
        res,
        'MISSING_REQUIRED_FIELDS',
        'Missing required fields: idNumber, firstName, lastname',
        {
          required: ['idNumber', 'firstName', 'lastname'],
          received: {
            idNumber: !!idNumber,
            firstName: !!firstName,
            lastname: !!lastNameValue
          }
        },
        req
      );
    }

    const photoBase64 = (body.photoBase64 || '').trim();
    const photoUrl = (body.photoUrl || '').trim();

    if (!photoBase64 && !photoUrl) {
      return http.badRequest(
        res,
        'MISSING_IMAGE',
        'Must provide either photoBase64 or photoUrl',
        { required: 'One of: photoBase64, photoUrl' },
        req
      );
    }

    // Build QoreID request body. Do not send empty fields.
    const qoreidBody: Record<string, any> = {
      idNumber,
      firstName,
      lastname: lastNameValue
    };

    // Choose ONE image option. If both provided, prioritize base64.
    if (photoBase64) qoreidBody.photoBase64 = photoBase64;
    else qoreidBody.photoUrl = photoUrl;

    console.log('[DriversLicenseFaceVerification] Request', {
      requestId,
      customerId: customer.id,
      idNumberMasked: idNumber.slice(0, 3) + '***',
      hasPhotoBase64: !!photoBase64,
      hasPhotoUrl: !!photoUrl
    });

    // Get QoreID bearer token (internal)
    const qoreidToken = await QoreIDTokenService.getValidQoreIDToken();

    let qoreidResponse: globalThis.Response;
    try {
      qoreidResponse = await fetch(QOREID_DRIVERS_LICENSE_FACE_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${qoreidToken}`
        },
        body: JSON.stringify(qoreidBody)
      });
    } catch (e: any) {
      return http.serverError(
        res,
        'QOREID_NETWORK_ERROR',
        'Unable to reach verification provider',
        { message: e.message },
        req
      );
    }

    const respText = await qoreidResponse.text();
    let respJson: any;
    try {
      respJson = JSON.parse(respText);
    } catch {
      return http.serverError(
        res,
        'INVALID_QOREID_RESPONSE',
        'Verification provider returned an invalid response',
        { raw: respText },
        req
      );
    }

    if (!qoreidResponse.ok) {
      if (qoreidResponse.status === 400) {
        return http.badRequest(
          res,
          'DRIVERS_LICENSE_VERIFICATION_BAD_REQUEST',
          respJson?.message || 'Invalid drivers license verification request',
          { details: respJson },
          req
        );
      }

      if (qoreidResponse.status === 404) {
        return http.notFound(
          res,
          'DRIVERS_LICENSE_NOT_FOUND',
          'Drivers license not found or invalid',
          { idNumber: idNumber.slice(0, 3) + '***' },
          req
        );
      }

      return http.serverError(
        res,
        'DRIVERS_LICENSE_VERIFICATION_FAILED',
        respJson?.message || 'Drivers license verification failed',
        { statusCode: qoreidResponse.status, details: respJson },
        req
      );
    }

    return http.ok(
      res,
      {
        ...respJson,
        metadata: {
          requestId,
          timestamp: requestTimestamp,
          customerId: customer.id,
          service: 'drivers-license-verification',
          provider: 'qoreid'
        }
      },
      req
    );
  };

  // Canonical (short) route name
  router.post(
    '/business/identity/drivers-license-verification',
    validateContentType,
    sanitizeInput,
    authenticateCustomer,
    requireVerifiedBusiness,
    checkWalletBalance,   // Check wallet balance (returns 402 if insufficient)
    chargeWallet,         // Setup response interception to charge on success
    trackUsage,
    asyncHandler(handler)
  );
}

// Default export router
const driversLicenseRouter = Router();
registerDriversLicenseVerificationRoutes(driversLicenseRouter);
export default driversLicenseRouter;
