import { Router } from 'express';

/**
 * ===================================================================
 * LEGACY BUSINESS ROUTES (DEPRECATED)
 * ===================================================================
 * 
 * ?? THIS FILE IS DEPRECATED AND SCHEDULED FOR REMOVAL
 * 
 * All routes have been migrated to modular files in src/routes/business/
 * 
 * Migration Status:
 * ? Name search ? src/routes/business/name-search.routes.ts
 * ? Name registration ? src/routes/business/name-registration.routes.ts
 * ? Company registration ? src/routes/business/company-registration.routes.ts
 * ? Status check ? src/routes/business/status.routes.ts (includes health routes)
 * ? Utility routes ? src/routes/business/utility.routes.ts
 * ? Monitoring routes ? src/routes/admin/monitoring.routes.ts (admin-only)
 * ? Circuit breaker ? src/routes/admin/system.routes.ts (admin-only)
 * 
 * This file now exists only as a placeholder during the transition period.
 * It will be removed in the next cleanup phase.
 * 
 * DO NOT ADD NEW ROUTES HERE. Use the modular files instead.
 */

const router = Router();

// All routes have been migrated to src/routes/business/ and src/routes/admin/
// This router is now empty

export default router;
