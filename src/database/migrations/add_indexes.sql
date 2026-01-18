/**
 * Performance Optimization - Database Indexes
 * 
 * This migration adds indexes to frequently queried columns to improve query performance.
 * 
 * IMPORTANT: Run this migration during low-traffic periods as it may lock tables briefly.
 * 
 * Estimated time: 1-5 minutes depending on data volume
 */

-- ============================================================================
-- CUSTOMERS TABLE INDEXES
-- ============================================================================

-- Index on email for fast login lookups
-- Used in: Customer login, admin customer search, forgot password
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- Index on status for filtering active/inactive customers
-- Used in: Admin dashboard, customer list filtering
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- Index on verification_status for admin verification queue
-- Used in: Admin verification dashboard, filtering customers by verification state
CREATE INDEX IF NOT EXISTS idx_customers_verification_status ON customers(verification_status);

-- Index on created_at for sorting new customers
-- Used in: Admin dashboard "recent signups", customer list ordered by date
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);

-- Composite index for common admin queries (status + verification)
-- Used in: Admin dashboard overview, filtering active verified customers
CREATE INDEX IF NOT EXISTS idx_customers_status_verification 
  ON customers(status, verification_status);


-- ============================================================================
-- WALLET_TRANSACTIONS TABLE INDEXES
-- ============================================================================

-- Index on customer_id for fetching customer's transaction history
-- Used in: Customer wallet page, transaction history
-- CRITICAL: This is queried on every wallet page load
CREATE INDEX IF NOT EXISTS idx_wallet_txn_customer_id ON wallet_transactions(customer_id);

-- Index on reference for Paystack callback verification
-- Used in: Payment verification, webhook processing, callback page
-- CRITICAL: Must be fast for payment processing
CREATE INDEX IF NOT EXISTS idx_wallet_txn_reference ON wallet_transactions(reference);

-- Index on status for filtering pending/completed transactions
-- Used in: Admin revenue tracking, webhook processing
CREATE INDEX IF NOT EXISTS idx_wallet_txn_status ON wallet_transactions(status);

-- Index on type for revenue analytics (credits vs debits)
-- Used in: Admin revenue page, financial reports
CREATE INDEX IF NOT EXISTS idx_wallet_txn_type ON wallet_transactions(type);

-- Index on created_at for date-based queries and sorting
-- Used in: Transaction history (most recent first), revenue reports by date
CREATE INDEX IF NOT EXISTS idx_wallet_txn_created_at ON wallet_transactions(created_at DESC);

-- Composite index for admin revenue queries (type + status + date)
-- Used in: Admin revenue dashboard filtering by credits/debits in date range
CREATE INDEX IF NOT EXISTS idx_wallet_txn_revenue 
  ON wallet_transactions(type, status, created_at DESC);

-- Composite index for customer transaction history (customer + date)
-- Used in: Customer wallet page transaction list
-- CRITICAL: Optimizes the most common query pattern
CREATE INDEX IF NOT EXISTS idx_wallet_txn_customer_date 
  ON wallet_transactions(customer_id, created_at DESC);


-- ============================================================================
-- API_KEYS TABLE INDEXES
-- ============================================================================

-- Index on customer_id for fetching customer's API keys
-- Used in: Customer dashboard, API keys management
CREATE INDEX IF NOT EXISTS idx_api_keys_customer_id ON api_keys(customer_id);

-- Index on key_hash for API authentication
-- Used in: Every API request with API key authentication
-- CRITICAL: Must be extremely fast for auth
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);

-- Index on status for filtering active keys
-- Used in: API authentication (only check active keys)
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);

-- Composite index for API authentication (hash + status)
-- Used in: API request authentication
-- CRITICAL: Optimizes the auth check query
CREATE INDEX IF NOT EXISTS idx_api_keys_auth 
  ON api_keys(key_hash, status) 
  WHERE status = 'active';


-- ============================================================================
-- PRICING TABLE INDEXES
-- ============================================================================

-- Index on service_code for price lookups during API usage
-- Used in: Every business API call (to charge customer)
-- CRITICAL: Must be fast to not slow down API requests
CREATE INDEX IF NOT EXISTS idx_pricing_service_code ON pricing(service_code);

-- Index on is_active for filtering active services
-- Used in: Customer pricing list, admin pricing management
CREATE INDEX IF NOT EXISTS idx_pricing_is_active ON pricing(is_active);

-- Composite index for price lookup (code + active status)
-- Used in: API usage charging (only check active services)
-- CRITICAL: Optimizes the most common pricing query
CREATE INDEX IF NOT EXISTS idx_pricing_lookup 
  ON pricing(service_code, is_active) 
  WHERE is_active = true;


-- ============================================================================
-- VERIFICATION ATTEMPTS TABLE INDEXES
-- ============================================================================

-- Index on customer_id for admin verification queue
-- Used in: Admin verification dashboard, verification history
CREATE INDEX IF NOT EXISTS idx_verification_customer_id ON verification_attempts(customer_id);

-- Index on status for filtering pending verifications
-- Used in: Admin verification queue (show only pending)
CREATE INDEX IF NOT EXISTS idx_verification_status ON verification_attempts(status);

-- Index on submitted_at for sorting queue by date
-- Used in: Admin verification queue (oldest first)
CREATE INDEX IF NOT EXISTS idx_verification_submitted_at ON verification_attempts(submitted_at DESC);

-- Composite index for admin queue (status + date)
-- Used in: Admin verification dashboard main query
CREATE INDEX IF NOT EXISTS idx_verification_queue 
  ON verification_attempts(status, submitted_at DESC);


-- ============================================================================
-- VERIFICATION RESULTS TABLE INDEXES
-- ============================================================================

-- Index on customer_id for fetching verification history
-- Used in: Admin customer detail page, verification audit
CREATE INDEX IF NOT EXISTS idx_verification_results_customer_id ON verification_results(customer_id);

-- Index on verification_id for linking to attempts
-- Used in: Verification detail view
CREATE INDEX IF NOT EXISTS idx_verification_results_verification_id ON verification_results(verification_id);


-- ============================================================================
-- USAGE_RECORDS TABLE INDEXES (if exists)
-- ============================================================================

-- Index on customer_id for usage analytics
-- Used in: Customer usage dashboard, billing
CREATE INDEX IF NOT EXISTS idx_usage_customer_id ON usage_records(customer_id);

-- Index on timestamp for date-based queries
-- Used in: Usage reports by date range
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp DESC);

-- Index on billing_period for monthly billing
-- Used in: Monthly usage aggregation
CREATE INDEX IF NOT EXISTS idx_usage_billing_period ON usage_records(billing_period);


-- ============================================================================
-- PERFORMANCE ANALYSIS QUERIES
-- ============================================================================

-- Use these queries to analyze index effectiveness:

-- Check index usage:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- ORDER BY idx_scan DESC;

-- Find unused indexes:
-- SELECT schemaname, tablename, indexname, idx_scan
-- FROM pg_stat_user_indexes
-- WHERE idx_scan = 0;

-- Check table sizes and index sizes:
-- SELECT
--   tablename,
--   pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
--   pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
--   pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;


-- ============================================================================
-- NOTES FOR DEVELOPERS
-- ============================================================================

/**
 * INDEX MAINTENANCE:
 * - Indexes speed up reads but slow down writes slightly
 * - PostgreSQL automatically maintains indexes
 * - Consider REINDEX if queries become slow over time
 * - Monitor index bloat in production
 * 
 * WHEN TO ADD NEW INDEXES:
 * - Add indexes for columns used in WHERE clauses frequently
 * - Add indexes for columns used in JOIN conditions
 * - Add indexes for columns used in ORDER BY
 * - DON'T over-index - too many indexes slow down writes
 * 
 * COMPOSITE INDEX ORDER:
 * - Most selective column first (highest cardinality)
 * - Columns used in equality checks before range checks
 * - Example: (status, created_at) not (created_at, status)
 */
