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

export const businessRouter = Router();

// Register all business routes (Phase 2.3 + Phase 8 - all routes now modular)
registerNameSearchRoutes(businessRouter);
registerNameRegistrationRoutes(businessRouter);
registerCompanyRegistrationRoutes(businessRouter);
registerStatusRoutes(businessRouter);
registerUtilityRoutes(businessRouter);

// 2) Legacy routes (temporary during migration)
// These include company-registration, name-registration, status, etc.
// As we split, we will remove them gradually from the legacy file and
// add their modular counterparts here.
businessRouter.use('/', legacyBusinessRoutes);

export default businessRouter;
