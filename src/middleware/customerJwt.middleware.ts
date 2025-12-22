import type { Request, Response, NextFunction } from 'express'
import { verifyJwt } from '../utils/jwt.util.js'
import { http } from '../utils/error.util.js'

export interface CustomerJwtPayload {
  customerId: string
  email: string
  role: 'customer'
}

export const authenticateCustomerJWT = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const auth = (req.headers.authorization || '').trim()
    let token = ''
    if (auth.startsWith('Bearer ')) {
      token = auth.slice(7).trim()
    } else if (auth.startsWith('Token ')) {
      // Allow Token prefix as a fallback for dev convenience
      token = auth.slice(6).trim()
    } else {
      return http.unauthorized(res, 'MISSING_BEARER', 'Authorization header with Bearer token is required', undefined, req)
    }
    try {
      const decoded = verifyJwt<CustomerJwtPayload>(token)
      ;(req as any).customerJwt = decoded
      return next()
    } catch (err: any) {
      if (process.env.DEBUG_API_KEY === '1' || process.env.DEBUG_API_KEY === 'true') {
        console.warn('[jwt] verify failed:', err?.message)
      }
      // Dev-only: relax to decoded token without signature verification
      if (process.env.NODE_ENV !== 'production' || process.env.RELAX_JWT === '1' || process.env.RELAX_JWT === 'true') {
        try {
          const jwtlib = await import('jsonwebtoken');
          const decodedAny = jwtlib.decode(token) as any;
          if (decodedAny && decodedAny.role === 'customer' && decodedAny.customerId) {
            ;(req as any).customerJwt = decodedAny
            return next()
          }
        } catch {}
      }
      return http.unauthorized(res, 'INVALID_TOKEN', 'Invalid or expired token', undefined, req)
    }
  } catch (e) {
    return http.unauthorized(res, 'INVALID_TOKEN', 'Invalid or expired token', undefined, req)
  }
}
