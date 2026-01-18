import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { CustomerStore } from '../../services/customerPortal.store.js';
import { CustomerService } from '../../services/customer.service.js';
import { signJwt } from '../../utils/jwt.util.js';
import { http } from '../../utils/error.util.js';

/**
 * ===================================================================
 * CUSTOMER AUTHENTICATION ROUTES
 * ===================================================================
 * Handles customer signup and login for the customer portal.
 * 
 * Authentication Types Explained:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 1. JWT Token (Portal Access)                                │
 * │    - Used for: Portal operations (profile, key management)  │
 * │    - Format: Bearer eyJhbGciOiJIUzI1NiIs...                 │
 * │    - Obtained: After signup/login                           │
 * │    - Lifetime: Configurable (default: 30 days)             │
 * │                                                             │
 * │ 2. API Key (Business Operations)                           │
 * │    - Used for: Business API calls (name search, registration)│
 * │    - Format: Token ck_fa80b8382479af...                     │
 * │    - Obtained: Customer generates via portal (using JWT)    │
 * │    - Lifetime: No expiration unless revoked                 │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * Flow:
 * 1. Customer signs up → Gets JWT token
 * 2. Customer uses JWT to access portal
 * 3. Customer generates API key (via portal with JWT)
 * 4. Customer uses API key for business operations
 */

/**
 * Registers customer authentication routes.
 * 
 * Routes:
 * - POST /customer/auth/signup - Create new customer account
 * - POST /customer/auth/login  - Login existing customer
 */
export function registerAuthRoutes(router: Router) {
  /**
   * POST /customer/auth/signup
   * 
   * Creates a new customer account with enhanced KYC fields.
   * 
   * Required Fields:
   * - email: Valid email address (unique)
   * - password: Min 8 chars, must include letters and numbers
   * - full_name: At least first and last name (space-separated)
   * - nin_bvn: Nigerian NIN (11 digits) or BVN (10 digits)
   * - phone_number: Nigerian phone format (e.g., 08012345678)
   * 
   * Optional Fields:
   * - company: Company name
   * - plan: 'pro' or 'basic' (default: 'basic')
   * - id_document: Base64 encoded ID card/passport image
   * 
   * Response:
   * - JWT token for immediate portal access
   * - Customer details (id, email, company, plan, status)
   */
  router.post('/auth/signup', async (req: Request, res: Response) => {
    try {
      const { email, password, company, full_name } = req.body || {};
      
      // Validate required fields
      if (!email || !password) {
        return http.badRequest(res, 'MISSING_FIELDS', 'Email and password are required', undefined, req);
      }
      
      if (!full_name) {
        return http.badRequest(res, 'MISSING_REQUIRED_FIELDS', 'Full name is required', undefined, req);
      }

      // Validate full name (must have at least two names)
      const nameParts = full_name.trim().split(/\s+/);
      if (nameParts.length < 2) {
        return http.badRequest(res, 'INVALID_NAME', 'Full name must include at least first and last name (separated by space)', undefined, req);
      }

      // Basic password policy
      const pwd = String(password);
      const strongEnough = pwd.length >= 8 && /[A-Za-z]/.test(pwd) && /\d/.test(pwd);
      if (!strongEnough) {
        return http.badRequest(res, 'WEAK_PASSWORD', 'Password must be at least 8 characters and include letters and numbers', undefined, req);
      }

      // Check if email already exists in portal store (in-memory)
      const existingPortal = CustomerStore.findByEmail(email);
      if (existingPortal) {
        return http.conflict(res, 'EMAIL_EXISTS', 'An account with this email already exists', undefined, req);
      }

      // Check if email already exists in primary database (persistent)
      const existingDb = await (await import('../../database/index.js')).database.getCustomerByEmail(email);
      if (existingDb) {
        return http.conflict(res, 'EMAIL_EXISTS', 'An account with this email already exists', undefined, req);
      }

      // FIXED: Hash password once for storage in both places
      const passwordHash = await bcrypt.hash(String(password), 10);

      // Create persistent customer in main database with basic info
      const dbCustomer = await CustomerService.createCustomer({
        email,
        company,
        full_name,
        passwordHash
      });

      // Create portal account with same hashed password (not plain password)
      // Pass isHashed=true to prevent double-hashing
      const portalCustomer = CustomerStore.create(email, passwordHash, company, dbCustomer.walletBalance as any, dbCustomer.id, undefined, true);

      // Issue JWT for immediate portal session
      // This token allows customer to access portal features:
      // - View profile
      // - Generate API keys
      // - View usage statistics
      const token = signJwt({ customerId: portalCustomer.id, email: portalCustomer.email, role: 'customer' });

      return http.created(res, {
        token,
        customer: {
          id: portalCustomer.id,
          email: portalCustomer.email,
          company: portalCustomer.company,
          walletBalance: portalCustomer.walletBalance,
          status: portalCustomer.status
        }
      }, req);
    } catch (e: any) {
      // Handle specific error cases
      if (e?.message === 'EMAIL_EXISTS') {
        return http.conflict(res, 'EMAIL_EXISTS', 'An account with this email already exists', undefined, req);
      }
      
      // Concise error logging (no large payloads)
      if (process.env.LOG_LEVEL === 'error') {
        console.error('[Customer Signup] Error:', {
          errorCode: e.code || 'UNKNOWN',
          message: e.message,
          email: req.body?.email,
          requestId: req.requestId,
        });
      }
      
      return http.serverError(res, 'SIGNUP_FAILED', 'Failed to create account', undefined, req);
    }
  });

  /**
   * POST /customer/auth/login
   * 
   * Authenticates existing customer and returns JWT token.
   * 
   * Required Fields:
   * - email: Customer's registered email
   * - password: Customer's password
   * 
   * Response:
   * - JWT token for portal access
   * - Customer details (id, email, plan, status)
   * 
   * Errors:
   * - 401: Invalid credentials
   * - 403: Account suspended
   */
  router.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      
      if (!email || !password) {
        return http.badRequest(res, 'MISSING_FIELDS', 'Email and password are required', undefined, req);
      }
      
      // FIXED: First check the persistent database for customer existence
      const dbCustomer = await (await import('../../database/index.js')).database.getCustomerByEmail(email);
      if (!dbCustomer) {
        return http.unauthorized(res, 'INVALID_CREDENTIALS', 'Invalid email or password', undefined, req);
      }
      
      // Check account status from database
      if (dbCustomer.status !== 'active') {
        return http.forbidden(res, 'ACCOUNT_SUSPENDED', 'Your account is suspended', undefined, req);
      }
      
      // Try to find customer in portal store (contains password hash)
      let customer = CustomerStore.findByEmail(email);
      
      // If customer exists in portal store but DB is missing password hash, persist it
      if (customer && !(dbCustomer as any).passwordHash) {
        try {
          await (await import('../../database/index.js')).database.updateCustomer(dbCustomer.id, {
            passwordHash: customer.passwordHash
          });
        } catch (updateError) {
          console.warn('[Customer Login] Failed to persist password hash to database:', updateError);
        }
      }
      
      // FIXED: If not found in portal store, try to restore from database
      if (!customer) {
        // This can happen after server restart - the in-memory store is empty
        // We need to check if there's a stored password hash in the database
        const storedPasswordHash = (dbCustomer as any).passwordHash;
        
        if (storedPasswordHash) {
          // Restore customer to in-memory store with existing password hash
          try {
            // Manually recreate the customer record in memory
            customer = (CustomerStore as any).customers.find((c: any) => c.email.toLowerCase() === email.toLowerCase());
            if (!customer) {
              const record = {
                id: dbCustomer.id,
                email: dbCustomer.email.toLowerCase(),
                passwordHash: storedPasswordHash,
                company: dbCustomer.company,
                phoneNumber: (dbCustomer as any).phone_number || (dbCustomer as any).phoneNumber,
                walletBalance: dbCustomer.walletBalance,
                status: dbCustomer.status as any,
                createdAt: dbCustomer.createdAt.toISOString(),
                apiKeys: [],
                usage: {}
              };
              (CustomerStore as any).customers.push(record);
              customer = record;
            }
          } catch (restoreError) {
            console.error('[Customer Login] Failed to restore customer from database:', restoreError);
            return http.unauthorized(res, 'INVALID_CREDENTIALS', 'Invalid email or password', undefined, req);
          }
        } else {
          // No password hash in database - this can happen for legacy accounts
          return http.unauthorized(
            res,
            'PASSWORD_NOT_SET',
            'Account password not found. Please reset your password or re-register.',
            undefined,
            req
          );
        }
      }
      
      // Verify password
      const passwordValid = await bcrypt.compare(password, customer.passwordHash);
      if (!passwordValid) {
        return http.unauthorized(res, 'INVALID_CREDENTIALS', 'Invalid email or password', undefined, req);
      }
      
      // Update last login timestamp in both stores
      CustomerStore.update(customer.id, { lastLogin: new Date().toISOString() });
      
      // Issue JWT token for portal session
      const token = signJwt({ customerId: customer.id, email: customer.email, role: 'customer' });
      
      return http.ok(res, {
        token,
        customer: {
          id: customer.id,
          email: customer.email,
          walletBalance: customer.walletBalance,
          status: customer.status
        }
      }, req);
    } catch (e: any) {
      // Concise error logging (no large payloads)
      if (process.env.LOG_LEVEL === 'error') {
        console.error('[Customer Login] Error:', {
          errorCode: e.code || 'UNKNOWN',
          message: e.message,
          email: req.body?.email,
          requestId: req.requestId,
        });
      }
      
      return http.serverError(res, 'LOGIN_FAILED', 'Failed to login', undefined, req);
    }
  });

  /**
   * POST /customer/auth/forgot-password
   * 
   * Generates a password reset token and (in the future) sends email.
   * For now, returns a reset link for development/testing.
   */
  router.post('/auth/forgot-password', async (req: Request, res: Response) => {
    try {
      const { email } = req.body || {};
      if (!email) {
        return http.badRequest(res, 'MISSING_FIELDS', 'Email is required', undefined, req);
      }

      const db = await import('../../database/index.js');
      const customer = await db.database.getCustomerByEmail(email);

      // Always return success to avoid user enumeration
      if (!customer) {
        return http.ok(res, {
          message: 'If this email exists, a reset link will be sent.'
        }, req);
      }

      // Generate token and hash
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Persist in database
      await db.database.updateCustomer(customer.id, {
        resetTokenHash: tokenHash,
        resetTokenExpires: expiresAt
      });

      // Persist in portal store if present
      const portalCustomer = CustomerStore.findByEmail(email);
      if (portalCustomer) {
        CustomerStore.update(portalCustomer.id, {
          resetTokenHash: tokenHash,
          resetTokenExpires: expiresAt.toISOString()
        });
      }

      // Placeholder for email integration
      const resetLink = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/customer/reset-password?token=${rawToken}`;
      console.log('[Password Reset] Reset link generated:', resetLink);

      return http.ok(res, {
        message: 'If this email exists, a reset link will be sent.',
        // DEV ONLY: return link for testing; remove in production
        resetLink
      }, req);
    } catch (e: any) {
      return http.serverError(res, 'RESET_REQUEST_FAILED', 'Failed to initiate password reset', undefined, req);
    }
  });

  /**
   * POST /customer/auth/reset-password
   * 
   * Resets password using a valid token.
   */
  router.post('/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const { token, password } = req.body || {};
      if (!token || !password) {
        return http.badRequest(res, 'MISSING_FIELDS', 'Token and new password are required', undefined, req);
      }

      const pwd = String(password);
      const strongEnough = pwd.length >= 8 && /[A-Za-z]/.test(pwd) && /\d/.test(pwd);
      if (!strongEnough) {
        return http.badRequest(res, 'WEAK_PASSWORD', 'Password must be at least 8 characters and include letters and numbers', undefined, req);
      }

      const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
      const db = await import('../../database/index.js');
      const customer = await db.database.getCustomerByResetTokenHash(tokenHash);

      if (!customer || !customer.resetTokenExpires || customer.resetTokenExpires < new Date()) {
        return http.unauthorized(res, 'INVALID_TOKEN', 'Reset token is invalid or expired', undefined, req);
      }

      const newPasswordHash = await bcrypt.hash(pwd, 10);
      await db.database.updateCustomer(customer.id, {
        passwordHash: newPasswordHash,
        resetTokenHash: undefined,
        resetTokenExpires: undefined
      });

      // Update portal store if present
      const portalCustomer = CustomerStore.findByEmail(customer.email);
      if (portalCustomer) {
        CustomerStore.update(portalCustomer.id, {
          passwordHash: newPasswordHash,
          resetTokenHash: undefined,
          resetTokenExpires: undefined
        });
      }

      return http.ok(res, { message: 'Password reset successful. Please log in.' }, req);
    } catch (e: any) {
      return http.serverError(res, 'RESET_FAILED', 'Failed to reset password', undefined, req);
    }
  });
}



