import jwt, { SignOptions } from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production'
const JWT_ISSUER = process.env.JWT_ISSUER || 'business-api'
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'business-api-clients'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || process.env.JWT_EXPIRY || '24h'

export interface StandardJwtPayload {
  sub?: string
  iat?: number
  exp?: number
  iss?: string
  aud?: string
  [key: string]: any
}

export function signJwt(payload: Record<string, any>, options: SignOptions = {}) {
  const finalOptions: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as any, // cast to satisfy types; value comes from env (e.g., '24h')
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    ...options,
  }
  return jwt.sign(payload, JWT_SECRET, finalOptions)
}

export function verifyJwt<T = StandardJwtPayload>(token: string): T {
  const relax = process.env.NODE_ENV !== 'production' || process.env.RELAX_JWT === '1' || process.env.RELAX_JWT === 'true';
  if (relax) {
    // In development, verify signature only to avoid issuer/audience drift
    return jwt.verify(token, JWT_SECRET) as T;
  }
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as T;
}

export const jwtConfig = {
  secretSet: !!process.env.JWT_SECRET,
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
  expiresIn: JWT_EXPIRES_IN,
}
