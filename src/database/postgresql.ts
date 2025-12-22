/**
 * PostgreSQL Implementation
 * Digital Ocean/traditional database implementation
 */

import { 
  DatabaseInterface, 
  Customer, 
  CustomerData, 
  ApiKey, 
  ApiKeyData, 
  UsageRecord, 
  UsageRecordData,
  UsageStats,
  BusinessOverview,
  SystemMetrics,
  ListOptions 
} from './index.js';

import type { Pool, QueryResult } from 'pg';

// PostgreSQL client (will be installed when migrating to Digital Ocean)
let pool: Pool | null = null;

export class PostgreSQLDatabase implements DatabaseInterface {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Import pg (PostgreSQL client)
      const { Pool } = await import('pg');
      
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });

      // Test connection
      await pool.query('SELECT NOW()');
      
      // Create tables if they don't exist
      await this.createTables();
      
      this.initialized = true;
      console.log('✅ PostgreSQL initialized successfully');
    } catch (error) {
      console.error('❌ PostgreSQL initialization failed:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    const tables = [
      // Customers table
      `CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        company VARCHAR(255),
        plan VARCHAR(50) DEFAULT 'basic',
        status VARCHAR(50) DEFAULT 'active',
        stripe_customer_id VARCHAR(255),
        stripe_subscription_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // API Keys table
      `CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
        key_hash VARCHAR(255) NOT NULL,
        key_prefix VARCHAR(20) NOT NULL,
        name VARCHAR(255) NOT NULL,
        permissions JSONB DEFAULT '[]',
        plan VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        requests_used INTEGER DEFAULT 0,
        requests_limit INTEGER NOT NULL,
        rate_limit_per_min INTEGER NOT NULL,
        last_used TIMESTAMP,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // Usage Records table
      `CREATE TABLE IF NOT EXISTS usage_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
        key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
        endpoint VARCHAR(255) NOT NULL,
        method VARCHAR(10) NOT NULL,
        status_code INTEGER NOT NULL,
        response_time_ms INTEGER,
        billing_period VARCHAR(20) NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW()
      )`,

      // Indexes for better performance
      `CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)`,
      `CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status)`,
      `CREATE INDEX IF NOT EXISTS idx_api_keys_customer_id ON api_keys(customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`,
      `CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_customer_id ON usage_records(customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_billing_period ON usage_records(billing_period)`,
      `CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_records(timestamp)`
    ];

    if (!pool) {
      throw new Error('Database pool not initialized');
    }

    for (const table of tables) {
      await pool.query(table);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!pool) return false;
      await pool.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('PostgreSQL health check failed:', error);
      return false;
    }
  }

  // Customer operations
  async createCustomer(customerData: CustomerData): Promise<Customer> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    const query = `
      INSERT INTO customers (email, company, plan, status, stripe_customer_id, stripe_subscription_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      customerData.email,
      customerData.company || null,
      customerData.plan,
      customerData.status,
      customerData.stripeCustomerId || null,
      customerData.stripeSubscriptionId || null
    ];

    const result: QueryResult = await pool.query(query, values);
    const row = result.rows[0];

    return {
      id: row.id,
      email: row.email,
      company: row.company,
      plan: row.plan,
      status: row.status,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    const query = 'SELECT * FROM customers WHERE id = $1';
    const result: QueryResult = await pool.query(query, [customerId]);
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      company: row.company,
      plan: row.plan,
      status: row.status,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async getCustomerByEmail(email: string): Promise<Customer | null> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    const query = 'SELECT * FROM customers WHERE email = $1';
    const result: QueryResult = await pool.query(query, [email]);
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      company: row.company,
      plan: row.plan,
      status: row.status,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async updateCustomer(customerId: string, updates: Partial<CustomerData>): Promise<Customer> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    const setClause = Object.keys(updates)
      .map((key, index) => `${this.camelToSnake(key)} = $${index + 2}`)
      .join(', ');

    const query = `
      UPDATE customers 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const values = [customerId, ...Object.values(updates)];
    const result: QueryResult = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      throw new Error('Customer not found');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      email: row.email,
      company: row.company,
      plan: row.plan,
      status: row.status,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async listCustomers(options: ListOptions = {}): Promise<{ customers: Customer[]; total: number; }> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    let query = 'SELECT * FROM customers';
    let countQuery = 'SELECT COUNT(*) FROM customers';
    const conditions: string[] = [];
    const values: any[] = [];
    let valueIndex = 1;

    // Apply filters
    if (options.search) {
      conditions.push(`email ILIKE $${valueIndex}`);
      values.push(`%${options.search}%`);
      valueIndex++;
    }

    if (options.status) {
      conditions.push(`status = $${valueIndex}`);
      values.push(options.status);
      valueIndex++;
    }

    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }

    // Apply pagination
    query += ' ORDER BY created_at DESC';
    if (options.limit) {
      query += ` LIMIT $${valueIndex}`;
      values.push(options.limit);
      valueIndex++;
    }
    if (options.offset) {
      query += ` OFFSET $${valueIndex}`;
      values.push(options.offset);
    }

    // Execute queries
    const [result, countResult] = await Promise.all([
      pool.query(query, values),
      pool.query(countQuery, values.slice(0, valueIndex - (options.limit ? 1 : 0) - (options.offset ? 1 : 0)))
    ]);

    const customers = result.rows.map((row: any) => ({
      id: row.id,
      email: row.email,
      company: row.company,
      plan: row.plan,
      status: row.status,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    return {
      customers,
      total: parseInt(countResult.rows[0]?.count || '0')
    };
  }

  async deleteCustomer(customerId: string): Promise<void> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    await pool.query('DELETE FROM customers WHERE id = $1', [customerId]);
  }

  // API Key operations (implementing essential methods)
  async createApiKey(apiKeyData: ApiKeyData): Promise<ApiKey> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    const query = `
      INSERT INTO api_keys (
        customer_id, key_hash, key_prefix, name, permissions, plan, 
        status, requests_used, requests_limit, rate_limit_per_min, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    
    const values = [
      apiKeyData.customerId,
      apiKeyData.keyHash,
      apiKeyData.keyPrefix,
      apiKeyData.name,
      JSON.stringify(apiKeyData.permissions),
      apiKeyData.plan,
      apiKeyData.status,
      apiKeyData.requestsUsed,
      apiKeyData.requestsLimit,
      apiKeyData.rateLimitPerMin,
      apiKeyData.expiresAt || null
    ];

    const result: QueryResult = await pool.query(query, values);
    const row = result.rows[0];

    return this.mapApiKeyRow(row);
  }

  async getApiKey(keyId: string): Promise<ApiKey | null> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    const result: QueryResult = await pool.query('SELECT * FROM api_keys WHERE id = $1', [keyId]);
    return result.rows.length > 0 ? this.mapApiKeyRow(result.rows[0]) : null;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    const query = 'SELECT * FROM api_keys WHERE key_hash = $1 AND status = $2';
    const result: QueryResult = await pool.query(query, [keyHash, 'active']);
    return result.rows.length > 0 ? this.mapApiKeyRow(result.rows[0]) : null;
  }

  async listApiKeys(customerId?: string): Promise<ApiKey[]> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    let query = 'SELECT * FROM api_keys';
    const values: any[] = [];

    if (customerId) {
      query += ' WHERE customer_id = $1';
      values.push(customerId);
    }

    query += ' ORDER BY created_at DESC';
    const result: QueryResult = await pool.query(query, values);
    
    return result.rows.map((row: any) => this.mapApiKeyRow(row));
  }

  async updateApiKey(keyId: string, updates: Partial<ApiKeyData>): Promise<ApiKey> {
    // Implementation similar to updateCustomer
    // ... (truncated for brevity)
    throw new Error('updateApiKey not implemented for PostgreSQL');
  }

  async deleteApiKey(keyId: string): Promise<void> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    await pool.query('DELETE FROM api_keys WHERE id = $1', [keyId]);
  }

  // Usage tracking (basic implementation)
  async recordUsage(usageData: UsageRecordData): Promise<void> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    const query = `
      INSERT INTO usage_records (
        customer_id, key_id, endpoint, method, status_code, 
        response_time_ms, billing_period
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    
    const values = [
      usageData.customerId,
      usageData.keyId,
      usageData.endpoint,
      usageData.method,
      usageData.statusCode,
      usageData.responseTimeMs,
      usageData.billingPeriod
    ];

    await pool.query(query, values);
  }

  // Other methods (implementing basic versions)
  async getUsage(customerId: string, period?: string): Promise<UsageRecord[]> {
    // Basic implementation - can be expanded
    return [];
  }

  async getUsageStats(customerId: string): Promise<UsageStats> {
    if (!pool) {
      throw new Error('Database not initialized');
    }

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = now.toISOString().split('T')[0];

    // Get all usage for this customer
    const allUsageQuery = `
      SELECT * FROM usage_records 
      WHERE customer_id = $1 
      ORDER BY timestamp DESC
    `;
    const allUsageResult = await pool.query(allUsageQuery, [customerId]);
    
    // Get this month's usage
    const monthlyQuery = `
      SELECT * FROM usage_records 
      WHERE customer_id = $1 AND billing_period = $2
    `;
    const monthlyResult = await pool.query(monthlyQuery, [customerId, thisMonth]);
    
    // Get today's usage
    const todayQuery = `
      SELECT COUNT(*) as count FROM usage_records 
      WHERE customer_id = $1 AND DATE(timestamp) = $2
    `;
    const todayResult = await pool.query(todayQuery, [customerId, today]);

    const allUsage = allUsageResult.rows;
    const monthlyUsage = monthlyResult.rows;
    
    // Calculate stats
    const totalCalls = allUsage.length;
    const successfulCalls = allUsage.filter(r => r.status_code >= 200 && r.status_code < 400).length;
    const failedCalls = allUsage.filter(r => r.status_code >= 400).length;
    const successRate = totalCalls > 0 ? successfulCalls / totalCalls : 0;
    
    const requestsThisMonth = monthlyUsage.length;
    const requestsToday = parseInt(todayResult.rows[0]?.count || '0');
    
    // Calculate popular endpoints
    const endpointCounts: Record<string, number> = {};
    monthlyUsage.forEach(r => {
      endpointCounts[r.endpoint] = (endpointCounts[r.endpoint] || 0) + 1;
    });
    const popularEndpoints = Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    const errorRequests = monthlyUsage.filter(r => r.status_code >= 400).length;
    const errorRate = requestsThisMonth > 0 ? errorRequests / requestsThisMonth : 0;
    
    const lastCallAt = allUsage.length > 0 ? new Date(allUsage[0].timestamp) : undefined;

    return {
      requestsThisMonth,
      requestsToday,
      totalCalls,
      successfulCalls,
      failedCalls,
      successRate,
      popularEndpoints,
      errorRate,
      lastCallAt
    };
  }

  async getBusinessOverview(): Promise<BusinessOverview> {
    // Basic implementation - can be expanded
    return {
      totalCustomers: 0,
      activeCustomers: 0,
      monthlyRevenue: 0,
      apiRequestsToday: 0,
      apiRequestsThisMonth: 0,
      errorRate: 0,
      newSignupsThisMonth: 0
    };
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    const databaseHealth = await this.healthCheck();
    
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      activeConnections: 0, // Can be queried from pg_stat_activity
      databaseHealth
    };
  }

  // Helper methods
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  private mapApiKeyRow(row: any): ApiKey {
    return {
      id: row.id,
      customerId: row.customer_id,
      keyHash: row.key_hash,
      keyPrefix: row.key_prefix,
      name: row.name,
      permissions: JSON.parse(row.permissions || '[]'),
      plan: row.plan,
      status: row.status,
      requestsUsed: row.requests_used,
      requestsLimit: row.requests_limit,
      rateLimitPerMin: row.rate_limit_per_min,
      lastUsed: row.last_used,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}