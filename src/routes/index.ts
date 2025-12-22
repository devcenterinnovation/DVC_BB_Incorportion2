import { Router } from "express";
import { businessRouter } from './business/index.js';
import adminRouter from './admin/index.js';
import { customerRouter } from './customer/index.js';

const router = Router();

// Mount business routes directly under /v1 (since business.routes.ts already has /api/v1/* paths)
// So routes will be available at /api/v1/name-search, /api/v1/health, etc.
router.use('/', businessRouter);

// Mount admin routes (modular structure - Phase 7 complete)
// Available at /api/v1/admin/auth/login, /api/v1/admin/overview, etc.
router.use("/admin", adminRouter);

// Mount customer portal routes at /api/v1/customer/*
router.use('/customer', customerRouter);

export default router;
