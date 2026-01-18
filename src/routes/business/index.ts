import { Router } from 'express';
// Business feature router (Phase 2.3)
// This router aggregates all business-related sub-routers.
// Migration note: We are incrementally moving routes from the legacy
// src/routes/business.routes.ts file into modular feature files.
// During the transition, we mount both the new feature routes and the
// remaining legacy routes to preserve 100% backward compatibility.

import legacyBusinessRoutes from '../business.routes.js';
import { registerNameSearchRoutes } from './name-search.routes.js';
import { registerNameRegistrationRoutes } from './name-registration.routes.js';
import { registerCompanyRegistrationRoutes } from './company-registration.routes.js';
import { registerStatusRoutes } from './status.routes.js';
import { registerUtilityRoutes } from './utility.routes.js';
import { registerPassportFaceVerificationRoutes } from './face-verification.routes.js';
import { registerBvnBasicRoutes } from './bvn-basic.routes.js';
import { registerDriversLicenseVerificationRoutes } from './drivers-license-verification.routes.js';
import { registerVotersCardVerificationRoutes } from './voters-card-verification.routes.js';
import { registerPassportVerificationRoutes } from './passport-verification.routes.js';
import { requireVerifiedBusiness } from '../../middleware/verificationCheck.middleware.js';
import { checkWalletBalance, chargeWallet } from '../../middleware/wallet.middleware.js';
import { usageLogger } from '../../middleware/usageLogger.middleware.js';

export const businessRouter = Router();

// Apply usage logger to ALL business routes (must be first)
businessRouter.use(usageLogger);

// Apply wallet middleware to ALL business routes
// This ensures balance is checked before and charged after each billable request
// Note: checkWalletBalance must run AFTER authenticateCustomer (which sets req.customer)
// The individual routes handle: authenticateCustomer -> requireVerifiedBusiness -> [route handler]
// We add wallet charging at router level to wrap all responses

// Note: Verification checking is now done at individual route level
// after authentication. See each route file for: 
// authenticateCustomer, requireVerifiedBusiness, ...other middleware
// This ensures proper middleware order: auth first, then verification check

// Register all business routes (Phase 2.3 + Phase 8 - all routes now modular)
registerNameSearchRoutes(businessRouter);
registerNameRegistrationRoutes(businessRouter);
registerCompanyRegistrationRoutes(businessRouter);
registerStatusRoutes(businessRouter);
registerUtilityRoutes(businessRouter);
registerPassportFaceVerificationRoutes(businessRouter); // Passport face verification using QoreID
registerBvnBasicRoutes(businessRouter); // BVN basic verification using QoreID
registerDriversLicenseVerificationRoutes(businessRouter); // Drivers license face verification using QoreID
registerVotersCardVerificationRoutes(businessRouter); // Voters card verification using QoreID
registerPassportVerificationRoutes(businessRouter); // Passport verification using QoreID (no image required)

// 2) Legacy routes (temporary during migration)
// These include company-registration, name-registration, status, etc.
// As we split, we will remove them gradually from the legacy file and
// add their modular counterparts here.
businessRouter.use('/', legacyBusinessRoutes);

export default businessRouter;
