import { Router } from 'express';
import verificationRoutes from './verification.routes';

/**
 * Register admin verification routes.
 * Base path: /api/v1/admin
 */
export function registerVerificationRoutes(router: Router) {
  router.use('/', verificationRoutes);
}
