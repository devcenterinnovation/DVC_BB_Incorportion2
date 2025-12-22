import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { http } from '../../utils/error.util.js';
import { authenticateCustomer } from '../../middleware/customerAuth.middleware.js';
import { documentsApiService } from '../../services/documentsApi.service.js';
import { healthService } from '../../services/health.service.js';

/**
 * ===================================================================
 * BUSINESS STATUS & HEALTH ROUTES
 * ===================================================================
 * 
 * This file contains:
 * 1. Business registration status checks (customer-facing)
 * 2. System health checks (public/monitoring)
 * 
 * Routes:
 * - GET /business/status/:referenceId - Check registration status
 * - GET /health - Main health check
 * - GET /health/ready - Kubernetes readiness probe
 * - GET /health/live - Kubernetes liveness probe
 */

/**
 * Registers unified status check routes for business registrations.
 * 
 * Public route:
 * GET /api/v1/business/status/:referenceId
 * 
 * Purpose: Check registration status for both business name registration 
 * and company registration using a single unified endpoint.
 * 
 * Authentication Flow (per TRUTH.md):
 * 1. Customer sends request with: Authorization: Token ck_customer_api_key
 * 2. Your API validates customer's token (authenticateCustomer middleware)
 * 3. Your API calls Documents.com.ng with: Token cac-YOUR_AGENT_ID (from .env)
 * 4. Documents.com.ng returns status
 * 5. Customer gets status response
 * 
 * The same endpoint works for both:
 * - Business name registration refs
 * - Company registration refs
 * 
 * Documents.com.ng determines the type based on the ref format.
 */
export function registerStatusRoutes(router: Router) {
  router.get(
    '/business/status/:referenceId',
    authenticateCustomer, // Validate customer API key
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { referenceId } = req.params;
        
        // Validate referenceId format
        if (!referenceId || referenceId.trim() === '') {
          return http.badRequest(
            res,
            'INVALID_REFERENCE_ID',
            'Reference ID is required',
            { providedValue: referenceId },
            req
          );
        }
        
        // Create request context for tracing
        const requestContext = {
          requestId: req.requestId || 'unknown',
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          timestamp: new Date().toISOString(),
          method: req.method,
          url: req.originalUrl,
        };
        
        // Check status with Documents.com.ng
        // Note: Service internally uses process.env.DOCUMENTS_AGENT_ID (YOUR Agent ID)
        // This works for both business name registration and company registration
        // The agentId parameter is ignored by the service - it always uses YOUR Agent ID from .env
        const statusResponse = await documentsApiService.getBusinessRegistrationStatus(
          referenceId,
          requestContext,
          '' // agentId parameter not used - service reads from process.env.DOCUMENTS_AGENT_ID
        );
        
        // Return unified status response
        // Documents.com.ng returns the same structure for both registration types
        return http.ok(res, {
          documentsApiResponse: statusResponse,
          middlewareMetadata: {
            processedAt: new Date().toISOString(),
            referenceId,
            statusCheckedAt: new Date().toISOString(),
          }
        }, req);
        
      } catch (error: any) {
        // Concise error logging (no large payloads)
        if (process.env.LOG_LEVEL === 'error') {
          console.error('[Status Check] Error:', {
            errorCode: error.name || 'UNKNOWN',
            message: error.message,
            ref: req.params.referenceId,
            requestId: req.requestId,
          });
        }
        
        // Handle external API errors
        return http.serverError(
          res,
          error.name === 'ExternalApiError' ? 'EXTERNAL_API_ERROR' : 'INTERNAL_ERROR',
          'Failed to check registration status',
          {
            originalError: error.message,
            referenceId: req.params.referenceId,
          },
          req
        );
      }
    })
  );

  /**
   * GET /health
   * 
   * Main health check endpoint for the entire API.
   * Returns comprehensive health status including:
   * - Overall service status (healthy/degraded/down)
   * - External API health (Documents.com.ng, CAC)
   * - Database health
   * - Memory usage
   * - Uptime
   * 
   * Used by monitoring systems and load balancers.
   * 
   * Authentication: None required (public endpoint)
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "status": "healthy",
   *     "uptime": 86400,
   *     "memory": { ... },
   *     "externalApis": { ... }
   *   }
   * }
   */
  router.get(
    '/health',
    asyncHandler(async (req: Request, res: Response) => {
      const healthCheck = await healthService.performHealthCheck();
      const statusCode = healthCheck.status === 'healthy' ? 200 : 
                        healthCheck.status === 'degraded' ? 200 : 503;

      return res.status(statusCode).json({
        success: true,
        data: healthCheck,
        timestamp: new Date().toISOString(),
        requestId: req.requestId || 'unknown',
      });
    })
  );

  /**
   * GET /health/ready
   * 
   * Kubernetes readiness probe.
   * 
   * Indicates whether the service is ready to accept traffic.
   * Returns 200 if ready, 503 if not ready.
   * 
   * Kubernetes uses this to determine when to start sending traffic
   * to a newly started pod.
   * 
   * Authentication: None required (K8s probe)
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "status": "ready",
   *     "checks": { ... }
   *   }
   * }
   */
  router.get(
    '/health/ready',
    asyncHandler(async (req: Request, res: Response) => {
      const readiness = await healthService.getReadinessProbe();
      const statusCode = readiness.status === 'ready' ? 200 : 503;

      return res.status(statusCode).json({
        success: true,
        data: readiness,
        timestamp: new Date().toISOString(),
        requestId: req.requestId || 'unknown',
      });
    })
  );

  /**
   * GET /health/live
   * 
   * Kubernetes liveness probe.
   * 
   * Indicates whether the service is alive and functioning.
   * Returns 200 if alive, 503 if should be restarted.
   * 
   * Kubernetes uses this to determine when to restart a pod
   * that has become unresponsive or deadlocked.
   * 
   * Authentication: None required (K8s probe)
   * 
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "status": "alive",
   *     "timestamp": "2024-12-19T10:00:00Z"
   *   }
   * }
   */
  router.get(
    '/health/live',
    asyncHandler(async (req: Request, res: Response) => {
      const liveness = healthService.getLivenessProbe();
      
      return http.ok(res, liveness, req);
    })
  );
}
