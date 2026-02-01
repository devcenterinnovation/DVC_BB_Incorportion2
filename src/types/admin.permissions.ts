/**
 * Admin Permission Definitions
 * 
 * Centralized permission system for admin role-based access control.
 * This file is imported by both middleware and routes to avoid circular dependencies.
 */

/**
 * Available permissions in the system
 * Super Admin has all permissions by default
 */
export const AVAILABLE_PERMISSIONS = {
  // Customer Management
  'view_customers': 'View customer list and details',
  'create_customers': 'Create new customer accounts',
  'edit_customers': 'Edit customer information',
  'delete_customers': 'Delete customer accounts',
  'manage_customer_wallet': 'Manage customer wallet balances',
  
  // Admin Management (Super Admin only)
  'view_admins': 'View admin list and details',
  'create_admins': 'Create new admin accounts',
  'edit_admins': 'Edit admin information and permissions',
  'delete_admins': 'Delete admin accounts',
  'manage_admin_permissions': 'Grant/revoke admin permissions',
  
  // Business Operations
  'view_verification_requests': 'View business verification requests',
  'approve_verifications': 'Approve business verifications',
  'reject_verifications': 'Reject business verifications',
  
  // Pricing Management
  'view_pricing': 'View service pricing',
  'edit_pricing': 'Edit service pricing',
  
  // Billing & Wallet
  'view_wallet_transactions': 'View all wallet transactions',
  'process_refunds': 'Process customer refunds',
  
  // System Management
  'view_dashboard': 'View admin dashboard',
  'view_system_metrics': 'View system performance metrics',
  'view_logs': 'View system logs',
  'manage_system_settings': 'Modify system configuration',
  
  // Usage Analytics
  'view_usage_analytics': 'View API usage analytics'
} as const;

export type Permission = keyof typeof AVAILABLE_PERMISSIONS;

/**
 * Default permission sets for different admin roles
 */
export const DEFAULT_PERMISSIONS = {
  super_admin: Object.keys(AVAILABLE_PERMISSIONS) as Permission[],
  admin: [
    // Customer Management
    'view_customers',
    'edit_customers',
    'manage_customer_wallet',
    
    // Business Operations
    'view_verification_requests',
    'approve_verifications',
    'reject_verifications',
    
    // Pricing Management
    'view_pricing',
    
    // Billing & Wallet
    'view_wallet_transactions',
    'process_refunds',
    
    // System Management
    'view_dashboard',
    'view_system_metrics',
    
    // Usage Analytics
    'view_usage_analytics'
  ],
  support: [
    'view_customers',
    'view_verification_requests',
    'view_pricing',
    'view_wallet_transactions',
    'view_dashboard'
  ]
};

/**
 * Role hierarchy for permission checking
 */
export const ROLE_HIERARCHY = {
  super_admin: 3,
  admin: 2,
  support: 1
} as const;

/**
 * Check if a role has permission to perform an action on another role
 */
export function canManageRole(managerRole: string, targetRole: string): boolean {
  const managerLevel = ROLE_HIERARCHY[managerRole as keyof typeof ROLE_HIERARCHY];
  const targetLevel = ROLE_HIERARCHY[targetRole as keyof typeof ROLE_HIERARCHY];
  
  return managerLevel > targetLevel;
}