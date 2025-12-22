import { Router, Request, Response } from 'express';
import { requireAdminAuth, requireAdminPermission } from '../../middleware/admin.middleware.js';
import { CustomerService } from '../../services/customer.service.js';
import { database } from '../../database/index.js';
import { http } from '../../utils/error.util.js';

/**
 * ===================================================================
 * ADMIN DASHBOARD ROUTES
 * ===================================================================
 * 
 * Handles admin dashboard data and metrics display.
 * 
 * These routes provide various views of system data for the admin dashboard:
 * - Business overview (customers, revenue, activity)
 * - Usage statistics (API calls, endpoints, customer usage)
 * - System health (uptime, memory, service status)
 * - Business metrics (detailed business analytics)
 * 
 * All routes require:
 * - Admin authentication (JWT token)
 * - 'view_all' permission
 * 
 * Routes:
 * - GET /overview - Business overview dashboard
 * - GET /usage/overview - Usage statistics and analytics
 * - GET /system-status - System health and status
 * - GET /metrics - Detailed business metrics
 */

/**
 * Registers admin dashboard routes.
 * 
 * @param router - Express router instance
 */
export function registerDashboardRoutes(router: Router) {
  /**
   * GET /overview
   * 
   * Get business overview dashboard data.
   * 
   * Returns high-level summary of business operations including:
   * - Customer count and status breakdown
   * - Recent activity and trends
   * - Key business metrics
   * 
   * Authentication: Admin JWT required
   * Permission: view_all
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "overview": {
   *       "totalCustomers": 150,
   *       "activeCustomers": 145,
   *       "totalApiCalls": 50000,
   *       "revenueThisMonth": 5000
   *     },
   *     "lastUpdated": "2024-12-19T10:00:00Z"
   *   }
   * }
   */
  router.get(
    '/overview',
    requireAdminAuth,
    requireAdminPermission('view_all'),
    async (req: Request, res: Response) => {
      try {
        // Get real business overview data from CustomerService
        const overview = await CustomerService.getBusinessMetrics();

        return http.ok(res, {
          overview,
          lastUpdated: new Date().toISOString()
        }, req);

      } catch (error) {
        console.error('Admin overview error:', error);
        return http.serverError(res, 'INTERNAL_ERROR', 'Failed to get admin overview', undefined, req);
      }
    }
  );

  /**
   * GET /usage/overview
   * 
   * Get usage statistics and analytics.
   * 
   * Returns detailed usage analytics including:
   * - API calls by day (time series)
   * - Most popular endpoints
   * - Customer usage rankings
   * - Aggregate totals
   * 
   * Query Parameters:
   * - range: Time range (default: '30d')
   *   Options: '7d', '30d', '90d', 'all'
   * 
   * Authentication: Admin JWT required
   * Permission: view_all
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "totals": {
   *       "calls": 50000,
   *       "customers": 150,
   *       "activeCustomers": 145
   *     },
   *     "callsByDay": [
   *       { "date": "2024-12-01", "count": 1200 },
   *       { "date": "2024-12-02", "count": 1350 }
   *     ],
   *     "endpointsByCount": [
   *       { "path": "/business/name-search", "count": 25000 },
   *       { "path": "/business/company-registration", "count": 15000 }
   *     ],
   *     "customersByUsage": [
   *       { "customerId": "cust_123", "count": 5000 },
   *       { "customerId": "cust_456", "count": 3500 }
   *     ],
   *     "range": "30d"
   *   }
   * }
   */
  router.get(
    '/usage/overview',
    requireAdminAuth,
    requireAdminPermission('view_all'),
    async (req: Request, res: Response) => {
      try {
        const range = (req.query.range as string) || '30d';
        
        // Get all customers
        const { customers } = await database.listCustomers?.({}) || { customers: [] as any[] };

        // Aggregate usage data
        const callsByDayMap = new Map<string, number>();
        const endpointsMap = new Map<string, number>();
        const customersMap = new Map<string, number>();

        for (const c of customers) {
          const records = await database.getUsage(c.id, range);
          customersMap.set(c.id, (customersMap.get(c.id) || 0) + records.length);
          
          for (const r of records) {
            // Aggregate by day
            const d = new Date(r.timestamp);
            const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
              .toISOString()
              .slice(0, 10);
            callsByDayMap.set(day, (callsByDayMap.get(day) || 0) + 1);
            
            // Aggregate by endpoint
            endpointsMap.set(r.endpoint, (endpointsMap.get(r.endpoint) || 0) + 1);
          }
        }

        // Convert maps to sorted arrays
        const callsByDay = [...callsByDayMap.entries()]
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date));
          
        const endpointsByCount = [...endpointsMap.entries()]
          .map(([path, count]) => ({ path, count }))
          .sort((a, b) => b.count - a.count);
          
        const customersByUsage = [...customersMap.entries()]
          .map(([customerId, count]) => ({ customerId, count }))
          .sort((a, b) => b.count - a.count);

        return http.ok(res, {
          totals: {
            calls: customersByUsage.reduce((sum, x) => sum + x.count, 0),
            customers: customers.length,
            activeCustomers: customers.filter((c: any) => c.status === 'active').length,
          },
          callsByDay,
          endpointsByCount,
          customersByUsage,
          range,
        }, req);
        
      } catch (error) {
        console.error('Admin usage overview error:', error);
        return http.serverError(res, 'INTERNAL_ERROR', 'Failed to get usage overview', undefined, req);
      }
    }
  );

  /**
   * GET /system-status
   * 
   * Get system health and status information.
   * 
   * Returns system health metrics including:
   * - Overall status (healthy/degraded/down)
   * - Server uptime
   * - Memory usage
   * - Environment information
   * - External service health
   * 
   * Authentication: Admin JWT required
   * Permission: view_all
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "status": "healthy",
   *     "uptime": 86400,
   *     "memory": {
   *       "rss": 123456789,
   *       "heapTotal": 98765432,
   *       "heapUsed": 87654321
   *     },
   *     "timestamp": "2024-12-19T10:00:00Z",
   *     "version": "1.0.0",
   *     "environment": "production",
   *     "services": {
   *       "database": "connected",
   *       "documentsApi": "healthy",
   *       "stripe": "healthy"
   *     }
   *   }
   * }
   */
  router.get(
    '/system-status',
    requireAdminAuth,
    requireAdminPermission('view_all'),
    async (req: Request, res: Response) => {
      try {
        const systemStatus = {
          status: 'healthy',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          services: {
            database: 'connected', // TODO: Check actual database connection
            documentsApi: 'unknown', // TODO: Check Documents.com.ng API health
            stripe: 'unknown' // TODO: Check Stripe API health
          }
        };

        return http.ok(res, systemStatus, req);

      } catch (error) {
        console.error('System status error:', error);
        return http.serverError(res, 'INTERNAL_ERROR', 'Failed to get system status', undefined, req);
      }
    }
  );

  /**
   * GET /metrics
   * 
   * Get detailed business metrics for admin dashboard.
   * 
   * Returns comprehensive business analytics including:
   * - Customer metrics (growth, churn, activation)
   * - Revenue metrics (MRR, ARR, ARPU)
   * - Usage metrics (API calls, popular endpoints)
   * - Performance metrics (response times, error rates)
   * 
   * Authentication: Admin JWT required
   * Permission: view_all
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "metrics": {
   *       "customers": {
   *         "total": 150,
   *         "active": 145,
   *         "new_this_month": 12
   *       },
   *       "revenue": {
   *         "mrr": 5000,
   *         "arr": 60000
   *       },
   *       "usage": {
   *         "api_calls_today": 1500,
   *         "api_calls_this_month": 45000
   *       }
   *     },
   *     "lastUpdated": "2024-12-19T10:00:00Z"
   *   }
   * }
   */
  router.get(
    '/metrics',
    requireAdminAuth,
    requireAdminPermission('view_all'),
    async (req: Request, res: Response) => {
      try {
        const metrics = await CustomerService.getBusinessMetrics();

        return http.ok(res, {
          metrics,
          lastUpdated: new Date().toISOString()
        }, req);

      } catch (error) {
        console.error('Admin metrics error:', error);
        return http.serverError(res, 'INTERNAL_ERROR', 'Failed to get business metrics', undefined, req);
      }
    }
  );
}
