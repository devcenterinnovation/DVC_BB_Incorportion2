/**
 * BVN Basic Verification Routes (QoreID)
 *
 * Implements TRUTH4.md flow:
 * - Customer authenticates to OUR API with API key (Token ck_...)
 * - Our API obtains QoreID Bearer token (internal)
 * - Our API calls QoreID BVN Basic endpoint
 *
 * QoreID endpoint:
 *   GET/POST? (TRUTH4 specifies using body) -> we use POST
 *   https://api.qoreid.com/v1/ng/identities/bvn-basic/{bvnNumber}
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

/**
 * Helper middleware to require customer API key in Authorization header.
 * Matches the business name registration pattern.
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

export interface BvnBasicRequestBody {
  firstName: string;
  // TRUTH4 shows both `lastname` and `lastName`. We accept either.
  lastname?: string;
  lastName?: string;
  gender?: string; // optional
  phone?: string; // optional
}

/**
 * Register BVN basic verification routes.
 *
 * Canonical route:
 *   POST /api/v1/business/identity/bvn-basic/:bvnNumber
 */
export function registerBvnBasicRoutes(router: Router) {
  router.post(
    '/business/identity/bvn-basic/:bvnNumber',
    validateContentType,
    sanitizeInput,
    requireCustomerApiKey,
    authenticateCustomer,
    requireVerifiedBusiness,
    checkWalletBalance,   // Check wallet balance (returns 402 if insufficient)
    chargeWallet,         // Setup response interception to charge on success
    trackUsage,
    asyncHandler(async (req: Request, res: Response) => {
      const customer = (req as any).customer;
      if (!customer?.id) {
        return http.unauthorized(
          res,
          'MISSING_CUSTOMER_CONTEXT',
          'Customer authentication failed (no customer context). Ensure you pass Authorization: Token ck_...'
        );
      }

      const bvnNumber = String(req.params.bvnNumber || '').trim();

      // BVN is typically 11 digits (Nigeria). We'll validate format lightly.
      if (!/^\d{11}$/.test(bvnNumber)) {
        return http.badRequest(
          res,
          'INVALID_BVN',
          'BVN number must be 11 digits',
          { bvnNumber }
        );
      }

      const body = req.body as BvnBasicRequestBody;

      const firstName = (body.firstName || '').trim();
      const lastNameValue = (body.lastname || body.lastName || '').trim();

      if (!firstName || !lastNameValue) {
        return http.badRequest(
          res,
          'MISSING_REQUIRED_FIELDS',
          'Missing required fields: firstName, lastname',
          {
            required: ['firstName', 'lastname'],
            received: { firstName: !!firstName, lastname: !!lastNameValue }
          },
          req
        );
      }

      // Build QoreID request body (do not send empty fields)
      const qoreidBody: Record<string, any> = {
        firstName,
        // TRUTH4 indicates `lastname` for QoreID request body
        lastname: lastNameValue
      };

      const gender = (body.gender || '').trim();
      if (gender) qoreidBody.gender = gender;

      const phone = (body.phone || '').trim();
      if (phone) qoreidBody.phone = phone;

      const qoreidUrl = `${QOREID_BASE_URL}/v1/ng/identities/bvn-basic/${encodeURIComponent(bvnNumber)}`;

      // Get QoreID bearer token (internal-only)
      const qoreidToken = await QoreIDTokenService.getValidQoreIDToken();

      let qoreidResponse: globalThis.Response;
      try {
        qoreidResponse = await fetch(qoreidUrl, {
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
          'Unable to reach BVN verification provider',
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
          'BVN verification provider returned an invalid response',
          { raw: respText },
          req
        );
      }

      if (!qoreidResponse.ok) {
        // Forward meaningful errors but keep our response format
        if (qoreidResponse.status === 400) {
          return http.badRequest(
            res,
            'BVN_VERIFICATION_BAD_REQUEST',
            respJson?.message || 'Invalid BVN verification request',
            { details: respJson },
            req
          );
        }

        if (qoreidResponse.status === 404) {
          return http.notFound(
            res,
            'BVN_NOT_FOUND',
            'BVN not found or invalid',
            { bvnNumber },
            req
          );
        }

        return http.serverError(
          res,
          'BVN_VERIFICATION_FAILED',
          respJson?.message || 'BVN verification failed',
          { statusCode: qoreidResponse.status, details: respJson },
          req
        );
      }

      // Success: return QoreID response as-is + metadata
      return http.ok(
        res,
        {
          ...respJson,
          metadata: {
            customerId: customer.id,
            service: 'bvn-basic',
            provider: 'qoreid',
            timestamp: new Date().toISOString()
          }
        },
        req
      );
    })
  );
}

// Backward-compatible default router export
const bvnBasicRouter = Router();
registerBvnBasicRoutes(bvnBasicRouter);
export default bvnBasicRouter;
