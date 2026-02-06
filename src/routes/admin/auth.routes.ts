import { Router } from 'express';
import {
  adminLogin,
  requireAdminAuth,
  getAdminProfile,
  updateAdminProfile,
  changeAdminPassword
} from '../../middleware/admin.middleware';
import { validateContentType, sanitizeInput } from '../../middleware/validation.middleware';

/**
 * ===================================================================
 * ADMIN AUTHENTICATION ROUTES
 * ===================================================================
 * 
 * Handles admin authentication and profile management.
 * 
 * Authentication Flow:
 * 1. Admin logs in with email/password → Receives JWT token
 * 2. Admin uses JWT token for all subsequent requests
 * 3. JWT contains admin ID, role, and permissions
 * 
 * Routes:
 * - POST /auth/login - Admin login
 * - GET /auth/profile - Get admin profile (legacy path)
 * - GET /profile - Get admin profile (standard path)
 * - PUT /profile - Update admin profile
 * - POST /auth/change-password - Change admin password
 * 
 * Middleware:
 * - adminLogin: Validates credentials and issues JWT
 * - requireAdminAuth: Verifies JWT and extracts admin data
 * - getAdminProfile: Returns admin profile data
 * - updateAdminProfile: Updates admin profile
 * - changeAdminPassword: Changes admin password
 */

/**
 * Registers admin authentication routes.
 * 
 * @param router - Express router instance
 */
export function registerAuthRoutes(router: Router) {
  /**
   * POST /auth/login
   * 
   * Admin login endpoint. Validates admin credentials and issues JWT token.
   * 
   * Request Body:
   * - email: Admin email address
   * - password: Admin password
   * 
   * Response:
   * - token: JWT token for authentication
   * - admin: Admin profile data (id, email, role, permissions)
   * 
   * Authentication: None required (public endpoint)
   * 
   * Example:
   * POST /api/v1/admin/auth/login
   * {
   *   "email": "admin@company.com",
   *   "password": "securePassword123"
   * }
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "token": "eyJhbGci...",
   *     "admin": {
   *       "id": "admin_123",
   *       "email": "admin@company.com",
   *       "role": "super_admin",
   *       "permissions": ["manage_customers", "manage_system"]
   *     }
   *   }
   * }
   */
  router.post(
    '/auth/login',
    validateContentType,
    sanitizeInput,
    adminLogin
  );

  /**
   * GET /auth/profile
   * 
   * Get admin profile (legacy path for backwards compatibility).
   * 
   * Authentication: JWT Bearer token required
   * 
   * Response:
   * - id: Admin ID
   * - email: Admin email
   * - role: Admin role (admin, super_admin)
   * - permissions: Array of permission strings
   * - createdAt: Account creation timestamp
   * 
   * @deprecated Use GET /profile instead
   */
  router.get(
    '/auth/profile',
    requireAdminAuth,
    getAdminProfile
  );

  /**
   * GET /profile
   * 
   * Get admin profile (standard REST path).
   * 
   * Authentication: JWT Bearer token required
   * 
   * Response:
   * - id: Admin ID
   * - email: Admin email
   * - role: Admin role (admin, super_admin)
   * - permissions: Array of permission strings
   * - createdAt: Account creation timestamp
   * - lastLogin: Last login timestamp
   * 
   * Example:
   * GET /api/v1/admin/profile
   * Headers: Authorization: Bearer <jwt_token>
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "id": "admin_123",
   *     "email": "admin@company.com",
   *     "role": "super_admin",
   *     "permissions": ["manage_customers", "manage_system"],
   *     "createdAt": "2024-01-01T00:00:00Z",
   *     "lastLogin": "2024-12-19T08:00:00Z"
   *   }
   * }
   */
  router.get(
    '/profile',
    requireAdminAuth,
    getAdminProfile
  );

  /**
   * PUT /profile
   * 
   * Update admin profile information.
   * 
   * Authentication: JWT Bearer token required
   * 
   * Request Body:
   * - email: (optional) New email address
   * - displayName: (optional) Display name
   * - preferences: (optional) Admin preferences object
   * 
   * Response:
   * - Updated admin profile
   * 
   * Permissions: Admin can update their own profile
   * Super admin can update any admin profile
   * 
   * Example:
   * PUT /api/v1/admin/profile
   * Headers: Authorization: Bearer <jwt_token>
   * {
   *   "displayName": "John Administrator",
   *   "preferences": {
   *     "theme": "dark",
   *     "notifications": true
   *   }
   * }
   */
  router.put(
    '/profile',
    validateContentType,
    sanitizeInput,
    requireAdminAuth,
    updateAdminProfile
  );

  /**
   * POST /auth/change-password
   * 
   * Change admin password.
   * 
   * Authentication: JWT Bearer token required
   * 
   * Request Body:
   * - currentPassword: Current password (for verification)
   * - newPassword: New password (must meet security requirements)
   * 
   * Response:
   * - success: true if password changed successfully
   * 
   * Password Requirements:
   * - Minimum 8 characters
   * - Must contain letters and numbers
   * - Must contain at least one uppercase letter
   * - Must contain at least one special character (recommended)
   * 
   * Example:
   * POST /api/v1/admin/auth/change-password
   * Headers: Authorization: Bearer <jwt_token>
   * {
   *   "currentPassword": "oldPassword123",
   *   "newPassword": "NewSecurePass123!"
   * }
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "message": "Password changed successfully"
   *   }
   * }
   */
  router.post(
    '/auth/change-password',
    validateContentType,
    sanitizeInput,
    requireAdminAuth,
    changeAdminPassword
  );
}
