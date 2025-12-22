import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
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
      const { email, password, company, plan, full_name, nin_bvn, phone_number, id_document } = req.body || {};
      
      // Validate required fields
      if (!email || !password) {
        return http.badRequest(res, 'MISSING_FIELDS', 'Email and password are required', undefined, req);
      }
      
      if (!full_name || !nin_bvn || !phone_number) {
        return http.badRequest(res, 'MISSING_REQUIRED_FIELDS', 'Full name, NIN/BVN, and phone number are required', undefined, req);
      }

      // Validate full name (must have at least two names)
      const nameParts = full_name.trim().split(/\s+/);
      if (nameParts.length < 2) {
        return http.badRequest(res, 'INVALID_NAME', 'Full name must include at least first and last name (separated by space)', undefined, req);
      }

      // Validate NIN/BVN (11 or 10 digits)
      const ninBvnDigits = nin_bvn.replace(/\D/g, '');
      if (ninBvnDigits.length !== 11 && ninBvnDigits.length !== 10) {
        return http.badRequest(res, 'INVALID_NIN_BVN', 'NIN must be 11 digits or BVN must be 10 digits', undefined, req);
      }

      // Validate phone number (Nigerian format preferred)
      const phonePattern = /^(\+234|0)?[789]\d{9}$/;
      const cleanPhone = phone_number.replace(/\s+/g, '');
      if (!phonePattern.test(cleanPhone)) {
        return http.badRequest(res, 'INVALID_PHONE', 'Please provide a valid Nigerian phone number (e.g., 08012345678 or +2348012345678)', undefined, req);
      }

      // Validate ID document if provided (base64 string)
      if (id_document && id_document.length < 100) {
        return http.badRequest(res, 'INVALID_ID_DOCUMENT', 'ID document must be a valid base64 encoded image', undefined, req);
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

      // Create persistent customer in main database with enhanced KYC fields AND password hash
      const dbCustomer = await CustomerService.createCustomer({
        email,
        company,
        plan: plan === 'pro' ? 'pro' : 'basic',
        full_name,
        nin_bvn: ninBvnDigits,
        phone_number: cleanPhone,
        id_document,
        passwordHash // FIXED: Store password hash in persistent database
      });

      // FIXED: Create portal account with same hashed password (not plain password)
      // Pass isHashed=true to prevent double-hashing
      const portalCustomer = CustomerStore.create(email, passwordHash, company, dbCustomer.plan as any, dbCustomer.id, cleanPhone, true);

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
          plan: portalCustomer.plan,
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
                plan: dbCustomer.plan as any,
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
          // No password hash in database - this shouldn't happen but handle gracefully
          return http.unauthorized(res, 'INVALID_CREDENTIALS', 'Invalid email or password', undefined, req);
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
          plan: customer.plan,
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
}
