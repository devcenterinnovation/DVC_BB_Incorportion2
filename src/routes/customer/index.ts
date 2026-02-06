import { Router } from 'express';

/**
 * ===================================================================
 * CUSTOMER PORTAL ROUTES
 * ===================================================================
 * 
 * This router aggregates all customer portal-related sub-routers.
 * 
 * Migration Status: ✅ COMPLETE (Phase 4)
 * - All routes migrated to modular structure
 * - Legacy customer.portal.routes.ts removed
 * 
 * Customer Routes Structure:
 * - auth.routes.ts: Customer signup, login
 * - profile.routes.ts: Customer profile management (GET /me)
 * - api-keys.routes.ts: API key generation and management
 * - usage.routes.ts: Usage tracking and statistics
 * - wallet.routes.ts: Wallet balance, transactions, top-up via Paystack
 */

import { registerAuthRoutes } from './auth.routes';
import { registerProfileRoutes } from './profile.routes';
import { registerApiKeysRoutes } from './api-keys.routes';
import { registerUsageRoutes } from './usage.routes';
import { registerVerificationRoutes } from './verification.register';
import { registerWalletRoutes } from './wallet.routes';

export const customerRouter = Router();

// Register all customer portal routes
registerAuthRoutes(customerRouter);
registerProfileRoutes(customerRouter);
registerApiKeysRoutes(customerRouter);
registerUsageRoutes(customerRouter);
registerVerificationRoutes(customerRouter);
registerWalletRoutes(customerRouter);  // Wallet balance, transactions, Paystack top-up

export default customerRouter;
