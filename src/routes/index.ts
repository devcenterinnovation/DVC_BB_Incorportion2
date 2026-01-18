import { Router } from "express";
import { businessRouter } from './business/index.js';
import adminRouter from './admin/index.js';
import { customerRouter } from './customer/index.js';
import qoreidUtilityRoutes from './utility/qoreid.routes.js';

const router = Router();

// IMPORTANT: Mount specific routes BEFORE the catch-all business router
// This ensures customer, admin, and utility routes are matched first

// Mount admin routes (modular structure - Phase 7 complete)
// Available at /api/v1/admin/auth/login, /api/v1/admin/overview, etc.
router.use("/admin", adminRouter);

// Mount customer portal routes at /api/v1/customer/*
// MUST be before business router to avoid being caught by businessRouter verification middleware
router.use('/customer', customerRouter);

// Mount utility routes at /api/v1/utility/* (standalone, not tracked for billing)
router.use('/utility', qoreidUtilityRoutes);

// Mount business routes directly under /v1 (since business.routes.ts already has /api/v1/* paths)
// So routes will be available at /api/v1/name-search, /api/v1/health, etc.
// MUST be last since it's mounted at '/' and will catch all unmatched routes
router.use('/', businessRouter);

export default router;
