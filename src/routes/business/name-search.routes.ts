import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { http } from '../../utils/error.util.js';
import { validateContentType, sanitizeInput, validateNameSimilaritySearch } from '../../middleware/validation.middleware.js';
import { authenticateCustomer, trackUsage } from '../../middleware/customerAuth.middleware.js';
// usageLogger removed - applied at app level in app.ts
import { cacApiService } from '../../services/cacApi.service.js';
import type { NameSearchRequest } from '../../types/api.js';

// Registers business name search routes on the provided router.
// This preserves the exact public path used previously:
// POST /api/v1/business/name-search
export function registerNameSearchRoutes(router: Router) {
  router.post(
    '/business/name-search',
    authenticateCustomer, // Customer API keys only
    // usageLogger applied at app level, no need to duplicate here
    trackUsage,           // Billing & quota tracking for authenticated customers
    validateContentType,
    sanitizeInput,
    validateNameSimilaritySearch,
    asyncHandler(async (req: Request, res: Response) => {
      try {
        // Extract inputs (validated by middleware already)
        const proposedName = req.body.proposedName;
        const lineOfBusiness = req.body.lineOfBusiness;

        // Prepare payload for CAC API
        const nameSearchRequest: NameSearchRequest = {
          proposedName,
          lineOfBusiness,
        };

        // Create request context for downstream services (for tracing)
        const requestContext = {
          requestId: req.requestId || 'unknown',
          ip: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          timestamp: new Date().toISOString(),
          method: req.method,
          url: req.originalUrl,
        };

        // Call CAC API service
        const cacResponse = await cacApiService.searchSimilarNames(nameSearchRequest, requestContext);

        // Parse CAC response in a backward-compatible way
        const responseData: any = cacResponse || {};
        const nestedData: any = responseData.data || {};
        const message: string = nestedData.message || '';
        const businessData: any = nestedData.data || {};

        const canProceed = message === 'PROCEED_TO_FILING';

        const result = {
          success: true,
          canProceed,
          message,
          proposedName,
          lineOfBusiness,
          ...(canProceed && {
            data: {
              recommendedActions: businessData.recommendedActions || [],
              similarityScore: businessData.similarityScorePercentage || null,
              complianceScore: businessData.complianceScorePercentage || null,
              mostSimilarName: businessData.mostSimilarName || null,
              details: businessData.details || null,
            },
          }),
          ...(!canProceed && {
            reason: message || 'Name unavailable',
            details: businessData,
          }),
          requestId: req.requestId || 'unknown',
          timestamp: new Date().toISOString(),
        };

        return res.status(200).json(result);
      } catch (error: any) {
        // Concise error path using standardized helpers
        return http.badGateway(
          res,
          'EXTERNAL_API_ERROR',
          error?.message || 'Name search failed',
          { requestId: req.requestId || 'unknown' },
          req
        );
      }
    })
  );
}
