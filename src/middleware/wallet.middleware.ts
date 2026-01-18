/**
 * Wallet Middleware
 * Handles wallet balance checking before API requests and debiting after successful responses
 * 
 * Flow:
 * 1. checkWalletBalance - Runs BEFORE the route handler, blocks if insufficient balance
 * 2. chargeWallet - Runs AFTER successful response (2xx), debits the wallet
 */

import { Request, Response, NextFunction } from 'express';
import { WalletService, InsufficientBalanceError } from '../services/wallet.service.js';
import { PricingService } from '../services/pricing.service.js';
import { http } from '../utils/error.util.js';

// Extend Express Request to include wallet context
declare global {
  namespace Express {
    interface Request {
      walletContext?: {
        serviceCode: string;
        priceKobo: number;
        balanceBefore: number;
        charged: boolean;
        transactionId?: string;
      };
    }
  }
}

/**
 * Extract service code from the request path
 * e.g., '/api/v1/business/name-search' -> 'name-search'
 */
function getServiceCodeFromRequest(req: Request): string | null {
  return PricingService.getServiceCodeFromEndpoint(req.originalUrl || req.path);
}

/**
 * Middleware: Check wallet balance before processing request
 * Must be placed AFTER authenticateCustomer (requires req.customer)
 * 
 * Blocks the request with HTTP 402 if insufficient balance
 */
export const checkWalletBalance = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Ensure customer is authenticated
    if (!req.customer) {
      http.unauthorized(res, 'CUSTOMER_NOT_AUTHENTICATED', 'Customer authentication required');
      return;
    }

    const customerId = req.customer.id;

    // Extract service code from the route
    const serviceCode = getServiceCodeFromRequest(req);
    if (!serviceCode) {
      // No service code found - this might be a non-billable endpoint
      // Let it through without wallet check
      next();
      return;
    }

    // Get price for this service
    const priceKobo = await PricingService.getPriceKobo(serviceCode);
    
    // If price is 0, it's a free service - let it through
    if (priceKobo === 0) {
      req.walletContext = {
        serviceCode,
        priceKobo: 0,
        balanceBefore: req.customer.walletBalance,
        charged: false
      };
      next();
      return;
    }

    // Check if customer can afford this service
    const affordability = await WalletService.canAffordService(customerId, serviceCode);

    if (!affordability.canAfford) {
      // Return 402 Payment Required with details
      res.status(402).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: 'Insufficient wallet balance for this request',
          details: {
            currentBalance: affordability.balance.balanceNaira,
            currentBalanceFormatted: affordability.balance.formattedBalance,
            serviceCost: affordability.serviceCost / 100,
            serviceCostFormatted: PricingService.formatPrice(affordability.serviceCost),
            shortfall: affordability.shortfall / 100,
            shortfallFormatted: PricingService.formatPrice(affordability.shortfall),
            service: serviceCode
          }
        },
        timestamp: new Date().toISOString(),
        requestId: req.requestId || 'unknown'
      });
      return;
    }

    // Store wallet context for post-response charging
    req.walletContext = {
      serviceCode,
      priceKobo,
      balanceBefore: affordability.balance.balanceKobo,
      charged: false
    };

    next();
  } catch (error: any) {
    console.error('Wallet balance check error:', error);
    http.serverError(res, 'WALLET_CHECK_ERROR', 'Failed to verify wallet balance');
  }
};

/**
 * Middleware: Charge wallet after successful response
 * This middleware wraps the response to intercept the status code
 * Only charges on 2xx responses
 */
export const chargeWallet = (
  req: Request, 
  res: Response, 
  next: NextFunction
): void => {
  // Store original res.json to intercept
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  // Flag to prevent double charging
  let hasCharged = false;

  const processCharge = async () => {
    // Only charge once and only for successful responses
    if (hasCharged) return;
    if (!req.walletContext || req.walletContext.charged) return;
    if (req.walletContext.priceKobo === 0) return;
    if (!req.customer) return;
    
    // Only charge on 2xx status codes
    const statusCode = res.statusCode;
    if (statusCode < 200 || statusCode >= 300) return;

    hasCharged = true;

    try {
      const { serviceCode, priceKobo } = req.walletContext;
      const customerId = req.customer.id;

      // Debit the wallet
      const result = await WalletService.debit(
        customerId,
        priceKobo,
        `API: ${serviceCode}`,
        {
          serviceCode,
          metadata: {
            endpoint: req.originalUrl,
            method: req.method,
            requestId: req.requestId,
            statusCode: res.statusCode
          }
        }
      );

      // Update wallet context
      req.walletContext.charged = true;
      req.walletContext.transactionId = result.transaction.id;

      // Log successful charge (debug mode)
      if (process.env.DEBUG_WALLET === 'true') {
        console.log(`[Wallet] Charged ${PricingService.formatPrice(priceKobo)} for ${serviceCode}`, {
          customerId,
          transactionId: result.transaction.id,
          newBalance: result.newBalance.formattedBalance
        });
      }
    } catch (error: any) {
      // Log error but don't fail the response (charge failed after successful API call)
      // This should be rare since we pre-checked the balance
      console.error('[Wallet] Failed to charge wallet after successful response:', error.message);
      
      // TODO: Add to a retry queue for failed charges
    }
  };

  // Override res.json
  res.json = function(body: any) {
    // Process charge asynchronously but don't block response
    processCharge().catch(console.error);
    return originalJson(body);
  };

  // Override res.send (for non-JSON responses)
  res.send = function(body: any) {
    processCharge().catch(console.error);
    return originalSend(body);
  };

  next();
};

/**
 * Combined middleware: Check balance AND setup charging
 * Use this as a single middleware for convenience
 */
export const walletMiddleware = [checkWalletBalance, chargeWallet];

/**
 * Create wallet middleware for a specific service code
 * Useful when the service code can't be inferred from the URL
 */
export function createWalletMiddleware(serviceCode: string) {
  return {
    checkBalance: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.customer) {
          http.unauthorized(res, 'CUSTOMER_NOT_AUTHENTICATED', 'Customer authentication required');
          return;
        }

        const customerId = req.customer.id;
        const priceKobo = await PricingService.getPriceKobo(serviceCode);

        if (priceKobo === 0) {
          req.walletContext = {
            serviceCode,
            priceKobo: 0,
            balanceBefore: req.customer.walletBalance,
            charged: false
          };
          next();
          return;
        }

        const affordability = await WalletService.canAffordService(customerId, serviceCode);

        if (!affordability.canAfford) {
          res.status(402).json({
            success: false,
            error: {
              code: 'INSUFFICIENT_BALANCE',
              message: 'Insufficient wallet balance for this request',
              details: {
                currentBalance: affordability.balance.balanceNaira,
                currentBalanceFormatted: affordability.balance.formattedBalance,
                serviceCost: affordability.serviceCost / 100,
                serviceCostFormatted: PricingService.formatPrice(affordability.serviceCost),
                shortfall: affordability.shortfall / 100,
                shortfallFormatted: PricingService.formatPrice(affordability.shortfall),
                service: serviceCode
              }
            },
            timestamp: new Date().toISOString(),
            requestId: req.requestId || 'unknown'
          });
          return;
        }

        req.walletContext = {
          serviceCode,
          priceKobo,
          balanceBefore: affordability.balance.balanceKobo,
          charged: false
        };

        next();
      } catch (error: any) {
        console.error('Wallet balance check error:', error);
        http.serverError(res, 'WALLET_CHECK_ERROR', 'Failed to verify wallet balance');
      }
    },
    charge: chargeWallet
  };
}

/**
 * Middleware to skip wallet charging for specific conditions
 * Use this to mark a request as non-billable even if it would normally be charged
 */
export const skipWalletCharge = (req: Request, res: Response, next: NextFunction): void => {
  if (req.walletContext) {
    req.walletContext.priceKobo = 0;
    req.walletContext.charged = true; // Prevent any charging
  }
  next();
};
