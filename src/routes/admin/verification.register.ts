import { Router } from 'express';
import verificationRoutes from './verification.routes.js';

/**
 * Register admin verification routes.
 * Base path: /api/v1/admin
 */
export function registerVerificationRoutes(router: Router) {
  router.use('/', verificationRoutes);
}
