import type { Request, Response, NextFunction } from 'express';
import { requireAdminAuth } from './admin.middleware';
import { authenticateCustomer } from './customerAuth.middleware';
import { http } from '../utils/error.util';

// Combined authentication: allows admin (Bearer admin JWT) OR customer (API key ck_...)
export async function authenticateAdminOrCustomer(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    const auth = (req.headers.authorization || '').trim();

    // // Admin path: Bearer <jwt> but not a ck_ token
    // if (auth.startsWith('Bearer ') && !auth.substring(7).startsWith('ck_')) {
    //   return requireAdminAuth(req, res, next);
    // }

    // Customer path: Token ck_... or Bearer ck_...
    if ((auth.startsWith('Token ') || auth.startsWith('Bearer ')) && auth.includes('ck_')) {
      return authenticateCustomer(req, res, next);
    }

    http.unauthorized(res, 'MISSING_TOKEN', 'Provide or customer API key (ck_...)');
    return;
  } catch (e) {
    console.error('authenticateAdminOrCustomer error:', e);
    http.serverError(res, 'AUTH_COMBINED_ERROR', 'Failed to authenticate request');
    return;
  }
}
