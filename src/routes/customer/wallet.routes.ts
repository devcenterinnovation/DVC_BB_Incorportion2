/**
 * Customer Wallet Routes
 * 
 * Endpoints for customer wallet management:
 * - GET  /wallet/balance     - Get current wallet balance
 * - GET  /wallet/transactions - Get transaction history
 * - POST /wallet/topup       - Initiate wallet top-up via Paystack
 * - GET  /wallet/topup/:reference - Check top-up status
 * 
 * All amounts are in kobo (100 kobo = ₦1)
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/error.middleware.js';
import { authenticateCustomerJWT } from '../../middleware/customerJwt.middleware.js';
import { burstProtection } from '../../middleware/rateLimit.middleware.js';
import { WalletService } from '../../services/wallet.service.js';
import { PaystackService, PaystackServiceError } from '../../services/paystack.service.js';
import { PricingService } from '../../services/pricing.service.js';
import { database } from '../../database/index.js';
import { http } from '../../utils/error.util.js';

const router = Router();

// Minimum and maximum top-up amounts (in kobo)
const MIN_TOPUP_AMOUNT = 10000;      // ₦100 minimum
const MAX_TOPUP_AMOUNT = 100000000;  // ₦1,000,000 maximum

/**
 * GET /wallet/balance
 * Get customer's current wallet balance
 * 
 * @route   GET /api/v1/customer/wallet/balance
 * @desc    Retrieve the authenticated customer's current wallet balance
 * @access  Private (Customer JWT required)
 * 
 * @security
 * - Requires valid customer JWT token in Authorization header
 * - Returns only the authenticated customer's balance (no risk of data leakage)
 * 
 * @performance
 * - Single database query using indexed customer_id
 * - Response time: ~10-20ms
 * 
 * @returns {Object} Balance information in multiple formats
 * @returns {number} data.balance.kobo - Balance in kobo (100 kobo = ₦1)
 * @returns {number} data.balance.naira - Balance in naira (for display)
 * @returns {string} data.balance.formatted - Human-readable format (e.g., "₦1,234.56")
 * 
 * @example
 * GET /api/v1/customer/wallet/balance
 * Authorization: Bearer <customer_jwt_token>
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "data": {
 *     "balance": {
 *       "kobo": 1000000,
 *       "naira": 10000,
 *       "formatted": "₦10,000.00"
 *     }
 *   },
 *   "timestamp": "2026-01-17T13:45:00.000Z"
 * }
 */
router.get(
  '/balance',
  authenticateCustomerJWT,
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = (req as any).customerJwt?.customerId;
    if (!customerId) {
      return http.unauthorized(res, 'INVALID_TOKEN', 'Customer not authenticated');
    }
    
    const balance = await WalletService.getBalance(customerId);

    res.json({
      success: true,
      data: {
        balance: {
          kobo: balance.balanceKobo,
          naira: balance.balanceNaira,
          formatted: balance.formattedBalance
        },
        currency: 'NGN'
      },
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * GET /wallet/transactions
 * Get customer's wallet transaction history
 * 
 * Query params:
 * - limit: number (default: 20, max: 100)
 * - offset: number (default: 0)
 */
router.get(
  '/transactions',
  authenticateCustomerJWT,
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = (req as any).customerJwt?.customerId;
    if (!customerId) {
      return http.unauthorized(res, 'INVALID_TOKEN', 'Customer not authenticated');
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const history = await WalletService.getTransactionHistory(customerId, { limit, offset });

    // Format transactions for response
    const formattedTransactions = history.transactions.map(txn => ({
      id: txn.id,
      type: txn.type,
      amount: {
        kobo: txn.amount,
        naira: txn.amount / 100,
        formatted: PricingService.formatPrice(txn.amount)
      },
      balanceBefore: {
        kobo: txn.balanceBefore,
        naira: txn.balanceBefore / 100
      },
      balanceAfter: {
        kobo: txn.balanceAfter,
        naira: txn.balanceAfter / 100
      },
      description: txn.description,
      reference: txn.reference,
      status: txn.status,
      paymentMethod: txn.paymentMethod,
      createdAt: txn.createdAt,
      completedAt: txn.completedAt
    }));

    res.json({
      success: true,
      data: {
        transactions: formattedTransactions,
        pagination: {
          total: history.total,
          limit,
          offset,
          hasMore: offset + limit < history.total
        },
        summary: {
          totalCredits: {
            kobo: history.summary.totalCredits,
            naira: history.summary.totalCredits / 100,
            formatted: PricingService.formatPrice(history.summary.totalCredits)
          },
          totalDebits: {
            kobo: history.summary.totalDebits,
            naira: history.summary.totalDebits / 100,
            formatted: PricingService.formatPrice(history.summary.totalDebits)
          },
          netChange: {
            kobo: history.summary.netChange,
            naira: history.summary.netChange / 100,
            formatted: PricingService.formatPrice(history.summary.netChange)
          }
        }
      },
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * POST /wallet/topup
 * Initiate a wallet top-up transaction via Paystack payment gateway
 * 
 * @route   POST /api/v1/customer/wallet/topup
 * @desc    Initialize Paystack payment to add funds to customer wallet
 * @access  Private (Customer JWT required)
 * 
 * @body {number} [amount] - Amount in Naira (e.g., 5000 for ₦5,000)
 * @body {number} [amountKobo] - Amount in kobo (e.g., 500000 for ₦5,000) - takes precedence
 * @body {string} [callbackUrl] - Custom callback URL (defaults to APP_BASE_URL/customer/wallet/callback)
 * 
 * @validation
 * - Min: ₦100 (10,000 kobo) | Max: ₦1,000,000 (100,000,000 kobo)
 * - Must provide either amount OR amountKobo
 * 
 * @workflow
 * 1. Authenticate customer → 2. Validate amount → 3. Generate unique reference
 * 4. Create pending transaction → 5. Initialize Paystack → 6. Return payment URL
 * 7. Customer pays on Paystack → 8. Webhook verifies & credits wallet
 * 
 * @security
 * - JWT authentication | Webhook signature verification | Crypto-random reference
 * - Double-credit protection via transaction status check
 * 
 * @performance Response time: ~250-400ms (includes Paystack API call)
 * 
 * @example
 * POST /api/v1/customer/wallet/topup
 * Authorization: Bearer <jwt_token>
 * { "amount": 5000 }
 * 
 * Response 201:
 * {
 *   "data": {
 *     "reference": "WLT_ABC123_12345678",
 *     "amount": { "kobo": 500000, "naira": 5000, "formatted": "₦5,000.00" },
 *     "payment": {
 *       "url": "https://checkout.paystack.com/xxxxx",
 *       "accessCode": "xxxxx"
 *     },
 *     "publicKey": "pk_test_xxxxx",
 *     "customerEmail": "user@example.com"
 *   }
 * }
 * 
 * @errors
 * - 400 INVALID_AMOUNT | 401 INVALID_TOKEN | 404 CUSTOMER_NOT_FOUND
 * - 500 PAYMENT_NOT_CONFIGURED | 500 PAYSTACK_ERROR
 */
router.post(
  '/topup',
  authenticateCustomerJWT,
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = (req as any).customerJwt?.customerId;
    const customerEmail = (req as any).customerJwt?.email;
    if (!customerId) {
      return http.unauthorized(res, 'INVALID_TOKEN', 'Customer not authenticated');
    }
    
    // Fetch full customer from database
    const customer = await database.getCustomer(customerId);
    if (!customer) {
      return http.notFound(res, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    }
    const { amount, amountKobo, callbackUrl } = req.body;

    // Check if Paystack is configured
    if (!PaystackService.isConfigured()) {
      return http.serverError(res, 'PAYMENT_NOT_CONFIGURED', 'Payment processing is not available. Please contact support.');
    }

    // Validate amount
    let finalAmountKobo: number;
    
    if (amountKobo !== undefined) {
      if (typeof amountKobo !== 'number' || amountKobo <= 0 || !Number.isInteger(amountKobo)) {
        return http.badRequest(res, 'INVALID_AMOUNT', 'amountKobo must be a positive integer');
      }
      finalAmountKobo = amountKobo;
    } else if (amount !== undefined) {
      if (typeof amount !== 'number' || amount <= 0) {
        return http.badRequest(res, 'INVALID_AMOUNT', 'amount must be a positive number');
      }
      finalAmountKobo = Math.round(amount * 100);
    } else {
      return http.badRequest(res, 'AMOUNT_REQUIRED', 'Either amount (Naira) or amountKobo is required');
    }

    // Check min/max limits
    if (finalAmountKobo < MIN_TOPUP_AMOUNT) {
      return http.badRequest(res, 'AMOUNT_TOO_LOW', `Minimum top-up amount is ${PricingService.formatPrice(MIN_TOPUP_AMOUNT)}`);
    }
    if (finalAmountKobo > MAX_TOPUP_AMOUNT) {
      return http.badRequest(res, 'AMOUNT_TOO_HIGH', `Maximum top-up amount is ${PricingService.formatPrice(MAX_TOPUP_AMOUNT)}`);
    }

    // Generate unique reference
    const reference = PaystackService.generateReference('WLT');

    // Get current balance for the pending transaction record
    const currentBalance = await WalletService.getBalance(customer.id);

    try {
      // Create a PENDING wallet transaction first (will be completed on webhook)
      await database.createWalletTransaction({
        customerId: customer.id,
        type: 'credit',
        amount: finalAmountKobo,
        balanceBefore: currentBalance.balanceKobo,
        balanceAfter: currentBalance.balanceKobo + finalAmountKobo, // Expected balance after
        description: 'Wallet top-up via Paystack',
        reference,
        paymentMethod: 'card', // Will be updated based on actual payment method
        status: 'pending',
        metadata: {
          source: 'paystack',
          initiatedAt: new Date().toISOString()
        }
      });

      // Initialize Paystack transaction
      const paystackResponse = await PaystackService.initializeTransaction({
        email: customer.email,
        amount: finalAmountKobo,
        reference,
        callbackUrl,
        metadata: {
          customerId: customer.id,
          customerEmail: customer.email,
          transactionType: 'wallet_topup'
        },
        channels: ['card', 'bank', 'ussd', 'bank_transfer']
      });

      res.status(201).json({
        success: true,
        message: 'Top-up initiated successfully. Complete payment to credit your wallet.',
        data: {
          reference,
          amount: {
            kobo: finalAmountKobo,
            naira: finalAmountKobo / 100,
            formatted: PricingService.formatPrice(finalAmountKobo)
          },
          payment: {
            url: paystackResponse.data.authorization_url,
            accessCode: paystackResponse.data.access_code,
            reference: paystackResponse.data.reference
          },
          publicKey: PaystackService.getPublicKey(), // For inline/popup integration
          customerEmail: customer.email, // For Paystack popup integration
          expiresIn: '24 hours'
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      // If Paystack fails, mark our pending transaction as failed
      const pendingTxn = await database.getWalletTransactionByReference(reference);
      if (pendingTxn) {
        await database.updateWalletTransactionStatus(pendingTxn.id, 'failed');
      }

      if (error instanceof PaystackServiceError) {
        console.error('[Wallet TopUp] Paystack error:', error.message);
        return http.serverError(res, error.code, error.message);
      }

      throw error;
    }
  })
);

/**
 * GET /wallet/topup/verify/:reference
 * Public endpoint to verify a payment (used by callback page after Paystack redirect)
 * This endpoint doesn't require authentication since user may have lost session during redirect
 * 
 * SECURITY: Burst protection to prevent abuse (max 5 requests per second per IP)
 */
router.get(
  '/topup/verify/:reference',
  burstProtection,
  asyncHandler(async (req: Request, res: Response) => {
    const { reference } = req.params;

    // Get our local transaction
    const transaction = await database.getWalletTransactionByReference(reference);
    
    if (!transaction) {
      return http.notFound(res, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
    }

    // If still pending and Paystack is configured, check with Paystack and process
    let paystackStatus = null;
    if (transaction.status === 'pending' && PaystackService.isConfigured()) {
      try {
        const verification = await PaystackService.verifyTransaction(reference);
        paystackStatus = {
          status: verification.data.status,
          paidAt: verification.data.paid_at,
          channel: verification.data.channel,
          gatewayResponse: verification.data.gateway_response
        };

        // If Paystack shows success but our transaction is still pending, process it
        if (verification.data.status === 'success' && transaction.status === 'pending') {
          console.log(`[Wallet] Public verification found successful payment for ${reference}`);
          await processSuccessfulPayment(transaction.customerId, transaction, verification.data);
          
          // Refresh transaction data
          const updatedTxn = await database.getWalletTransactionByReference(reference);
          if (updatedTxn) {
            return res.json({
              success: true,
              data: {
                transaction: formatTransactionResponse(updatedTxn),
                paystackStatus,
                message: 'Payment verified and wallet credited'
              },
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error: any) {
        console.error('[Wallet] Failed to verify with Paystack:', error.message);
      }
    }

    res.json({
      success: true,
      data: {
        transaction: formatTransactionResponse(transaction),
        paystackStatus
      },
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * GET /wallet/topup/:reference
 * Check the status of a top-up transaction (authenticated)
 */
router.get(
  '/topup/:reference',
  authenticateCustomerJWT,
  asyncHandler(async (req: Request, res: Response) => {
    const customerId = (req as any).customerJwt?.customerId;
    if (!customerId) {
      return http.unauthorized(res, 'INVALID_TOKEN', 'Customer not authenticated');
    }
    
    // Fetch customer for verification
    const customer = await database.getCustomer(customerId);
    if (!customer) {
      return http.notFound(res, 'CUSTOMER_NOT_FOUND', 'Customer not found');
    }
    const { reference } = req.params;

    // Get our local transaction
    const transaction = await database.getWalletTransactionByReference(reference);
    
    if (!transaction) {
      return http.notFound(res, 'TRANSACTION_NOT_FOUND', 'Transaction not found');
    }

    // Verify it belongs to this customer
    if (transaction.customerId !== customer.id) {
      return http.forbidden(res, 'ACCESS_DENIED', 'You do not have access to this transaction');
    }

    // If still pending and Paystack is configured, check with Paystack
    let paystackStatus = null;
    if (transaction.status === 'pending' && PaystackService.isConfigured()) {
      try {
        const verification = await PaystackService.verifyTransaction(reference);
        paystackStatus = {
          status: verification.data.status,
          paidAt: verification.data.paid_at,
          channel: verification.data.channel,
          gatewayResponse: verification.data.gateway_response
        };

        // If Paystack shows success but our transaction is still pending,
        // the webhook might have failed - trigger manual processing
        if (verification.data.status === 'success' && transaction.status === 'pending') {
          console.log(`[Wallet] Manual verification found successful payment for ${reference}`);
          // Process the credit (this is a fallback - webhook should normally handle this)
          await processSuccessfulPayment(customer.id, transaction, verification.data);
          
          // Refresh transaction data
          const updatedTxn = await database.getWalletTransactionByReference(reference);
          if (updatedTxn) {
            return res.json({
              success: true,
              data: {
                transaction: formatTransactionResponse(updatedTxn),
                paystackStatus,
                message: 'Payment verified and wallet credited'
              },
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error: any) {
        console.error('[Wallet] Failed to verify with Paystack:', error.message);
        // Continue with local status
      }
    }

    res.json({
      success: true,
      data: {
        transaction: formatTransactionResponse(transaction),
        paystackStatus
      },
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * Helper: Format transaction for API response
 */
function formatTransactionResponse(txn: any) {
  return {
    id: txn.id,
    type: txn.type,
    amount: {
      kobo: txn.amount,
      naira: txn.amount / 100,
      formatted: PricingService.formatPrice(txn.amount)
    },
    status: txn.status,
    reference: txn.reference,
    description: txn.description,
    paymentMethod: txn.paymentMethod,
    createdAt: txn.createdAt,
    completedAt: txn.completedAt
  };
}

/**
 * Helper: Process a successful payment (used by webhook and manual verification)
 */
export async function processSuccessfulPayment(
  customerId: string,
  transaction: any,
  paystackData: any
): Promise<void> {
  // Double-check transaction is still pending
  const currentTxn = await database.getWalletTransactionByReference(transaction.reference);
  if (!currentTxn || currentTxn.status !== 'pending') {
    console.log(`[Wallet] Transaction ${transaction.reference} already processed (status: ${currentTxn?.status})`);
    return;
  }

  // Get fresh customer balance
  const customer = await database.getCustomer(customerId);
  if (!customer) {
    console.error(`[Wallet] Customer not found for payment: ${customerId}`);
    throw new Error('Customer not found');
  }

  // Update wallet balance
  const newBalance = customer.walletBalance + transaction.amount;
  await database.updateCustomer(customerId, { walletBalance: newBalance });

  // Update transaction status
  await database.updateWalletTransactionStatus(
    currentTxn.id,
    'completed',
    new Date(paystackData.paid_at || Date.now())
  );

  console.log(`[Wallet] Credited ${PricingService.formatPrice(transaction.amount)} to customer ${customerId}. New balance: ${PricingService.formatPrice(newBalance)}`);
}

/**
 * Register wallet routes on the customer router
 */
export function registerWalletRoutes(customerRouter: Router): void {
  customerRouter.use('/wallet', router);
}

export default router;
