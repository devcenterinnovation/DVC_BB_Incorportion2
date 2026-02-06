/**
 * Paystack Webhook Handler
 * 
 * Handles incoming webhooks from Paystack for payment events.
 * 
 * IMPORTANT SECURITY NOTES:
 * 1. Always validate webhook signatures
 * 2. Use raw body (not parsed JSON) for signature validation
 * 3. Respond quickly (within 5 seconds) - Paystack will retry on timeout
 * 4. Process asynchronously if needed, but acknowledge immediately
 * 5. Handle idempotency - webhooks may be sent multiple times
 * 
 * Supported Events:
 * - charge.success: Payment completed successfully
 * - charge.failed: Payment failed
 * 
 * Webhook URL to configure in Paystack dashboard:
 * https://your-domain.com/api/v1/webhooks/paystack
 */

import { Router, Request, Response } from 'express';
import { PaystackService, PaystackWebhookEvent, PaystackServiceError } from '../../services/paystack.service';
import { database } from '../../database/index';
import { PricingService } from '../../services/pricing.service';

const router = Router();

// Store for processed webhook events (prevents duplicate processing)
// In production, use Redis or database for persistence across instances
const processedEvents = new Set<string>();
const EVENT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * POST /webhooks/paystack
 * 
 * Paystack webhook endpoint
 * Must use raw body parser for signature validation
 */
router.post(
  '/',
  async (req: Request, res: Response) => {
    const signature = req.headers['x-paystack-signature'] as string;
    
    // Get raw body (must be configured in app.ts)
    const rawBody = (req as any).rawBody;
    
    if (!rawBody) {
      console.error('[Paystack Webhook] Raw body not available. Ensure raw body middleware is configured.');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (!signature) {
      console.error('[Paystack Webhook] Missing signature header');
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Validate signature and parse event
    let event: PaystackWebhookEvent;
    try {
      event = PaystackService.parseWebhookEvent(rawBody, signature);
    } catch (error: any) {
      if (error instanceof PaystackServiceError) {
        console.error(`[Paystack Webhook] Validation failed: ${error.message}`);
        return res.status(error.statusCode).json({ error: error.message });
      }
      console.error('[Paystack Webhook] Unknown error:', error);
      return res.status(400).json({ error: 'Invalid webhook' });
    }

    // Log event receipt
    console.log(`[Paystack Webhook] Received event: ${event.event}, reference: ${event.data.reference}`);

    // Check for duplicate (idempotency)
    const eventKey = `${event.event}:${event.data.reference}:${event.data.id}`;
    if (processedEvents.has(eventKey)) {
      console.log(`[Paystack Webhook] Duplicate event ignored: ${eventKey}`);
      return res.status(200).json({ message: 'Already processed' });
    }

    // Respond immediately to Paystack (they expect quick response)
    res.status(200).json({ message: 'Webhook received' });

    // Process event asynchronously
    processWebhookEvent(event, eventKey).catch(error => {
      console.error(`[Paystack Webhook] Processing error for ${event.data.reference}:`, error);
    });
  }
);

/**
 * Process webhook event asynchronously
 */
async function processWebhookEvent(event: PaystackWebhookEvent, eventKey: string): Promise<void> {
  try {
    switch (event.event) {
      case 'charge.success':
        await handleChargeSuccess(event.data);
        break;
      
      case 'charge.failed':
        await handleChargeFailed(event.data);
        break;
      
      default:
        console.log(`[Paystack Webhook] Unhandled event type: ${event.event}`);
    }

    // Mark as processed
    processedEvents.add(eventKey);
    
    // Clean up old entries (simple TTL implementation)
    setTimeout(() => processedEvents.delete(eventKey), EVENT_CACHE_TTL);
    
  } catch (error: any) {
    console.error(`[Paystack Webhook] Failed to process ${event.event}:`, error.message);
    throw error;
  }
}

/**
 * Handle successful charge (payment completed)
 */
async function handleChargeSuccess(data: PaystackWebhookEvent['data']): Promise<void> {
  const { reference, amount, metadata, customer, channel, paid_at } = data;

  console.log(`[Paystack Webhook] Processing successful charge: ${reference}, amount: ${amount} kobo`);

  // Validate this is a wallet top-up
  if (metadata?.transactionType !== 'wallet_topup') {
    console.log(`[Paystack Webhook] Not a wallet top-up transaction, ignoring: ${reference}`);
    return;
  }

  // Get customer ID from metadata
  const customerId = metadata?.customerId;
  if (!customerId) {
    console.error(`[Paystack Webhook] No customerId in metadata for: ${reference}`);
    return;
  }

  // Find our pending transaction
  const transaction = await database.getWalletTransactionByReference(reference);
  
  if (!transaction) {
    console.error(`[Paystack Webhook] Transaction not found in database: ${reference}`);
    // Could create a new transaction here if we want to handle edge cases
    return;
  }

  // Check if already processed
  if (transaction.status === 'completed') {
    console.log(`[Paystack Webhook] Transaction already completed: ${reference}`);
    return;
  }

  if (transaction.status !== 'pending') {
    console.log(`[Paystack Webhook] Transaction not pending (${transaction.status}): ${reference}`);
    return;
  }

  // Verify amount matches
  if (transaction.amount !== amount) {
    console.error(`[Paystack Webhook] Amount mismatch for ${reference}: expected ${transaction.amount}, got ${amount}`);
    // Still process but log the discrepancy
  }

  // Get customer and update balance
  const dbCustomer = await database.getCustomer(customerId);
  if (!dbCustomer) {
    console.error(`[Paystack Webhook] Customer not found: ${customerId}`);
    return;
  }

  // Calculate new balance (use actual paid amount from Paystack)
  const newBalance = dbCustomer.walletBalance + amount;

  // Update customer wallet balance
  await database.updateCustomer(customerId, { walletBalance: newBalance });

  // Update transaction to completed
  await database.updateWalletTransactionStatus(
    transaction.id,
    'completed',
    paid_at ? new Date(paid_at) : new Date()
  );

  console.log(`[Paystack Webhook] ✅ Wallet credited successfully:`);
  console.log(`  - Customer: ${customerId}`);
  console.log(`  - Amount: ${PricingService.formatPrice(amount)}`);
  console.log(`  - New Balance: ${PricingService.formatPrice(newBalance)}`);
  console.log(`  - Payment Channel: ${channel}`);
  console.log(`  - Reference: ${reference}`);
}

/**
 * Handle failed charge
 */
async function handleChargeFailed(data: PaystackWebhookEvent['data']): Promise<void> {
  const { reference, metadata, gateway_response } = data;

  console.log(`[Paystack Webhook] Processing failed charge: ${reference}`);

  // Only process wallet top-ups
  if (metadata?.transactionType !== 'wallet_topup') {
    return;
  }

  // Find our pending transaction
  const transaction = await database.getWalletTransactionByReference(reference);
  
  if (!transaction) {
    console.log(`[Paystack Webhook] Transaction not found for failed charge: ${reference}`);
    return;
  }

  // Update transaction status to failed
  if (transaction.status === 'pending') {
    await database.updateWalletTransactionStatus(transaction.id, 'failed');
    
    console.log(`[Paystack Webhook] ❌ Wallet top-up failed:`);
    console.log(`  - Reference: ${reference}`);
    console.log(`  - Reason: ${gateway_response}`);
  }
}

/**
 * Register webhook routes
 */
export function registerPaystackWebhook(appRouter: Router): void {
  appRouter.use('/webhooks/paystack', router);
}

export default router;
