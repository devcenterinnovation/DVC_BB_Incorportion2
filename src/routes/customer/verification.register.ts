import { Router } from 'express';
import verificationRoutes from './verification.routes.js';

/**
 * Register customer verification routes.
 * Base path: /api/v1/customer
 */
export function registerVerificationRoutes(router: Router) {
  router.use('/', verificationRoutes);
}
