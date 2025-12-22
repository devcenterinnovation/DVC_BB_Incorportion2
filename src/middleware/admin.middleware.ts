import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { signJwt, verifyJwt } from '../utils/jwt.util.js';
import { http } from '../utils/error.util.js';
import { database } from '../database/index.js';

/**
 * Admin Authentication Middleware
 * Handles admin login, JWT token generation, and admin-only route protection
 */

interface AdminUser {
  id: string;
  email: string;
  passwordHash: string;
  role: 'super_admin' | 'admin' | 'support';
  permissions: string[];
  lastLogin?: Date;
  createdAt: Date;
}

interface AdminJWTPayload {
  adminId: string;
  email: string;
  role: string;
  permissions: string[];
}

// Simple in-memory admin storage (will be moved to database later)
// For MVP, we keep it simple with environment variables
import { AdminConfigStore } from '../config/adminConfig.store.js';

export const ADMIN_CONFIG = {
  get email() { return AdminConfigStore.get().email; },
  set email(v: string) { /* no-op: prefer AdminConfigStore methods */ },
  get password() { return process.env.ADMIN_PASSWORD || 'admin123!CHANGE_THIS'; },
  get passwordHash() { return AdminConfigStore.get().passwordHash; },
  set passwordHash(v: string) { /* no-op: prefer AdminConfigStore methods */ }
} as any;

// TODO(rovodev): move JWT secret & expiry to a single shared util; enforce standard claims (iss, aud)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-admin-jwt-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

/**
 * Initialize admin user with hashed password
 */
export const initializeAdminUser = async (): Promise<void> => {
  try {
    // Initialize database connection
    await database.initialize();
    
    // Hash admin password if not already done
    if (!AdminConfigStore.get().passwordHash) {
      await AdminConfigStore.setEmailAndPassword(ADMIN_CONFIG.email, ADMIN_CONFIG.password);
      // Only log admin initialization when explicitly enabled with LOG_LEVEL
      // In production with no LOG_LEVEL set, this will be silent
      const logLevel = process.env.LOG_LEVEL?.toLowerCase();
      if (logLevel === 'info' || logLevel === 'debug') {
        console.log(`[ADMIN] User initialized: ${ADMIN_CONFIG.email}`);
        console.log(`[ADMIN] Default password: ${ADMIN_CONFIG.password}`);
        console.log('[ADMIN] WARNING: CHANGE THIS PASSWORD IMMEDIATELY IN PRODUCTION!');
      }
    }
  } catch (error) {
    console.error('❌ Admin initialization failed:', error);
  }
};

/**
 * Admin login endpoint handler
 */
// TODO(rovodev): add basic login attempt limiter (in-memory acceptable for MVP)
const adminAttempts: Record<string, { count: number; last: number }> = {};
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export const adminLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Simple in-memory login throttle per IP (MVP)
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = adminAttempts[ip] || { count: 0, last: now };
    if (now - entry.last > WINDOW_MS) {
      entry.count = 0; // reset window
    }
    entry.count += 1;
    entry.last = now;
    adminAttempts[ip] = entry;
    if (entry.count > MAX_ATTEMPTS) {
      http.tooMany(res, 'too_many_attempts', 'Too many login attempts. Please try again later.')
      return
    }

    // Validate input
    if (!email || !password) {
      http.badRequest(res, 'MISSING_CREDENTIALS', 'Email and password are required')
      return;
    }

    // Check admin credentials (simple email check for MVP)
    if (email !== ADMIN_CONFIG.email) {
      http.unauthorized(res, 'INVALID_CREDENTIALS', 'Invalid email or password', undefined, req);
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, AdminConfigStore.get().passwordHash);
    if (!isPasswordValid) {
      http.unauthorized(res, 'INVALID_CREDENTIALS', 'Invalid email or password', undefined, req);
      return;
    }

    // Generate JWT token
    const tokenPayload: AdminJWTPayload = {
      adminId: 'admin_001',
      email: ADMIN_CONFIG.email,
      role: 'super_admin',
      permissions: ['view_all', 'manage_customers', 'manage_billing', 'manage_system']
    };

    const token = signJwt(tokenPayload);

    // Return success response with standardized format
    http.ok(res, {
      token,
      admin: {
        id: 'admin_001',
        email: ADMIN_CONFIG.email,
        role: 'super_admin',
        permissions: ['view_all', 'manage_customers', 'manage_billing', 'manage_system'],
        lastLogin: new Date()
      },
      message: 'Admin login successful'
    }, req);

  } catch (error) {
    console.error('Admin login error:', error);
    http.serverError(res, 'INTERNAL_ERROR', 'Login failed due to server error', undefined, req);
  }
};

/**
 * Admin authentication middleware
 * Protects admin-only routes
 */
export const requireAdminAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      http.unauthorized(res, 'MISSING_ADMIN_TOKEN', 'Admin authentication token required. Format: Authorization: Bearer <token>', undefined, req);
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify JWT token
    const decoded = verifyJwt<AdminJWTPayload>(token);
    
    // Check admin user (simplified for MVP)
    if (decoded.adminId !== 'admin_001') {
      http.unauthorized(res, 'INVALID_ADMIN_TOKEN', 'Admin user not found or token invalid', undefined, req);
      return;
    }

    // Add admin info to request object
    req.admin = {
      id: decoded.adminId,
      email: decoded.email,
      role: decoded.role,
      permissions: decoded.permissions
    };

    next();

  } catch (error) {
    if ((error as any)?.name === 'JsonWebTokenError' || (error as any)?.name === 'TokenExpiredError') {
      http.unauthorized(res, 'INVALID_ADMIN_TOKEN', 'Invalid or expired admin token')
      return;
    }

    console.error('Admin auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ADMIN_AUTH_ERROR',
        message: 'Admin authentication failed'
      }
    });
  }
};

/**
 * Check admin permissions middleware
 */
export const requireAdminPermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(401).json({
        success: false,
        error: {
          code: 'ADMIN_NOT_AUTHENTICATED',
          message: 'Admin authentication required'
        }
      });
      return;
    }

    if (!req.admin.permissions.includes(permission) && !req.admin.permissions.includes('view_all')) {
      res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_ADMIN_PERMISSIONS',
          message: `Admin permission required: ${permission}`
        }
      });
      return;
    }

    next();
  };
};

/**
 * Get admin profile
 */
export const getAdminProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.admin) {
      res.status(401).json({
        success: false,
        error: {
          code: 'ADMIN_NOT_AUTHENTICATED',
          message: 'Admin authentication required'
        }
      });
      return;
    }

    res.json({
      success: true,
      data: {
        admin: {
          id: req.admin.id || 'admin_001',
          email: ADMIN_CONFIG.email,
          role: req.admin.role || 'super_admin',
          permissions: req.admin.permissions || ['view_all', 'manage_customers', 'manage_billing', 'manage_system'],
          lastLogin: new Date(),
          createdAt: new Date()
        }
      }
    });

  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get admin profile'
      }
    });
  }
};

/**
 * Update admin profile
 * Currently supports email updates
 */
export const updateAdminProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.admin) {
      res.status(401).json({
        success: false,
        error: {
          code: 'ADMIN_NOT_AUTHENTICATED',
          message: 'Admin authentication required'
        }
      });
      return;
    }

    const { email } = req.body;

    // Validate email format
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EMAIL',
            message: 'Invalid email format'
          }
        });
        return;
      }

      // Update email in config store
      const currentHash = AdminConfigStore.get().passwordHash;
      AdminConfigStore.setHashed(email, currentHash);
      
      console.log(`✅ Admin email updated: ${ADMIN_CONFIG.email} -> ${email}`);
    }

    // Return updated profile
    res.json({
      success: true,
      data: {
        admin: {
          id: req.admin.id || 'admin_001',
          email: ADMIN_CONFIG.email,
          role: req.admin.role || 'super_admin',
          permissions: req.admin.permissions || ['view_all', 'manage_customers', 'manage_billing', 'manage_system'],
          lastLogin: new Date(),
          createdAt: new Date()
        }
      },
      message: 'Admin profile updated successfully'
    });

  } catch (error) {
    console.error('Update admin profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update admin profile'
      }
    });
  }
};

/**
 * Change admin password
 */
export const changeAdminPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!req.admin) {
      res.status(401).json({
        success: false,
        error: {
          code: 'ADMIN_NOT_AUTHENTICATED',
          message: 'Admin authentication required'
        }
      });
      return;
    }

    // Validate input
    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PASSWORDS',
          message: 'Current password and new password are required'
        }
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        error: {
          code: 'WEAK_PASSWORD',
          message: 'New password must be at least 8 characters long'
        }
      });
      return;
    }

    // Verify current password against store
    const currentHash = AdminConfigStore.get().passwordHash;
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentHash);
    if (!isCurrentPasswordValid) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Current password is incorrect'
        }
      });
      return;
    }

    // Hash new password and update config
    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    AdminConfigStore.setHashed(ADMIN_CONFIG.email, newPasswordHash);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change admin password error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to change password'
      }
    });
  }
};

// Type declaration for Express Request
declare global {
  namespace Express {
    interface Request {
      admin?: {
        id: string;
        email: string;
        role: string;
        permissions: string[];
      };
    }
  }
}