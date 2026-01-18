import { Router, type Request, type Response } from 'express';
import { authenticateCustomerJWT } from '../../middleware/customerJwt.middleware.js';
import { CustomerStore } from '../../services/customerPortal.store.js';
import { CustomerService } from '../../services/customer.service.js';
import { http } from '../../utils/error.util.js';

/**
 * ===================================================================
 * CUSTOMER PROFILE ROUTES
 * ===================================================================
 * Handles customer profile retrieval and management.
 * 
 * Authentication: JWT Token (from login)
 * 
 * The customer must be logged in (JWT token required) to access their profile.
 * This is different from API key authentication used for business operations.
 * 
 * JWT Token Flow:
 * 1. Customer logs in → receives JWT token
 * 2. Customer includes JWT in portal requests: Authorization: Bearer <jwt_token>
 * 3. This middleware validates JWT and attaches customer to request
 * 4. Route handlers access customer via req.customer
 */

/**
 * Registers customer profile routes.
 * 
 * Routes:
 * - GET /customer/me - Get current customer's profile
 */
export function registerProfileRoutes(router: Router) {
  /**
   * GET /customer/me
   * 
   * Retrieve the authenticated customer's profile information.
   * 
   * Authentication: JWT Bearer token required
   * 
   * Response:
   * - Customer profile (id, email, company, plan, status, created date)
   * 
   * Used by: Customer portal dashboard to display user info
   */
  router.get('/me', authenticateCustomerJWT, async (req: Request, res: Response) => {
    try {
      // Customer JWT payload is attached to request by authenticateCustomerJWT middleware
      const jwt = (req as any).customerJwt;
      
      if (!jwt || !jwt.customerId) {
        return http.unauthorized(res, 'AUTHENTICATION_REQUIRED', 'Please login to access your profile', undefined, req);
      }
      
      // Fetch customer details from store using JWT customerId
      const customer = CustomerStore.findById(jwt.customerId);
      
      if (!customer) {
        return http.unauthorized(res, 'CUSTOMER_NOT_FOUND', 'Customer account not found', undefined, req);
      }
      
      // Fetch verification status from database
      let verificationStatus = 'inactive';
      try {
        const dbCustomer = await CustomerService.getCustomerDetails(jwt.customerId);
        // getCustomerDetails returns CustomerWithKeys which extends Customer
        // So we access verificationStatus directly from dbCustomer, not dbCustomer.customer
        if (dbCustomer) {
          verificationStatus = dbCustomer.verificationStatus || 'inactive';
          console.log('[Customer Profile] Fetched verification status from DB:', {
            customerId: jwt.customerId,
            email: dbCustomer.email,
            verificationStatus,
            fullCustomerObject: dbCustomer
          });
        }
      } catch (e) {
        console.error('[Customer Profile] Failed to fetch verification status:', e);
      }
      
      // Return customer profile (password hash excluded)
      return http.ok(res, {
        id: customer.id,
        email: customer.email,
        company: customer.company || null,
        phoneNumber: customer.phoneNumber || null,
        plan: customer.walletBalance || 'basic',
        status: customer.status || 'active',
        verificationStatus,
        createdAt: customer.createdAt || new Date().toISOString(),
        lastLogin: customer.lastLogin || null
      }, req);
    } catch (e: any) {
      // Concise error logging (no large payloads)
      if (process.env.LOG_LEVEL === 'error') {
        console.error('[Customer Profile] Error:', {
          errorCode: e.code || 'UNKNOWN',
          message: e.message,
          customerId: (req as any).customer?.id,
          requestId: req.requestId,
        });
      }
      
      return http.serverError(res, 'PROFILE_FETCH_FAILED', 'Failed to retrieve profile', undefined, req);
    }
  });

  /**
   * PUT /customer/me
   * 
   * Update the authenticated customer's profile information.
   * 
   * Allowed updates (customer-managed):
   * - company
   * - phoneNumber
   */
  router.put('/me', authenticateCustomerJWT, (req: Request, res: Response) => {
    try {
      const jwt = (req as any).customerJwt;
      if (!jwt || !jwt.customerId) {
        return http.unauthorized(res, 'AUTHENTICATION_REQUIRED', 'Please login to update your profile', undefined, req);
      }

      const existing = CustomerStore.findById(jwt.customerId);
      if (!existing) {
        return http.unauthorized(res, 'CUSTOMER_NOT_FOUND', 'Customer account not found', undefined, req);
      }

      const { company, phoneNumber } = req.body || {};

      // Validate company (optional)
      let companyValue: string | undefined = undefined;
      if (company !== undefined) {
        const c = String(company).trim();
        if (c.length > 0 && c.length < 2) {
          return http.badRequest(res, 'INVALID_COMPANY', 'Company name must be at least 2 characters', undefined, req);
        }
        if (c.length > 120) {
          return http.badRequest(res, 'INVALID_COMPANY', 'Company name must be 120 characters or less', undefined, req);
        }
        companyValue = c.length ? c : undefined;
      }

      // Validate phone number (optional)
      let phoneValue: string | undefined = undefined;
      if (phoneNumber !== undefined) {
        const raw = String(phoneNumber).replace(/\s+/g, '');
        if (raw.length === 0) {
          phoneValue = undefined;
        } else {
          const phonePattern = /^(\+234|0)?[789]\d{9}$/;
          if (!phonePattern.test(raw)) {
            return http.badRequest(res, 'INVALID_PHONE', 'Please provide a valid Nigerian phone number (e.g., 08012345678 or +2348012345678)', undefined, req);
          }
          phoneValue = raw;
        }
      }

      const updated = CustomerStore.update(jwt.customerId, {
        ...(company !== undefined ? { company: companyValue } : {}),
        ...(phoneNumber !== undefined ? { phoneNumber: phoneValue } : {}),
      });

      if (!updated) {
        return http.serverError(res, 'PROFILE_UPDATE_FAILED', 'Failed to update profile', undefined, req);
      }

      return http.ok(res, {
        id: updated.id,
        email: updated.email,
        company: updated.company || null,
        phoneNumber: updated.phoneNumber || null,
        plan: updated.walletBalance || 'basic',
        status: updated.status || 'active',
        createdAt: updated.createdAt || new Date().toISOString(),
        lastLogin: updated.lastLogin || null
      }, req);
    } catch (e: any) {
      return http.serverError(res, 'PROFILE_UPDATE_FAILED', e?.message || 'Failed to update profile', undefined, req);
    }
  });
}


