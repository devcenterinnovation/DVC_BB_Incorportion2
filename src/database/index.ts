/**
 * Database Abstraction Layer
 * Supports both Firestore (Firebase) and PostgreSQL (Digital Ocean)
 * Switch providers by changing DATABASE_TYPE environment variable
 */

import { FirestoreDatabase } from './firestore.js';
import { PostgreSQLDatabase } from './postgresql.js';
import { MemoryDatabase } from './memory.js';

export interface DatabaseInterface {
  // Customer operations
  createCustomer(customer: CustomerData): Promise<Customer>;
  getCustomer(customerId: string): Promise<Customer | null>;
  getCustomerByEmail(email: string): Promise<Customer | null>;
  updateCustomer(customerId: string, updates: Partial<CustomerData>): Promise<Customer>;
  listCustomers(options?: ListOptions): Promise<{ customers: Customer[]; total: number; }>;
  deleteCustomer(customerId: string): Promise<void>;

  // API Key operations
  createApiKey(apiKey: ApiKeyData): Promise<ApiKey>;
  getApiKey(keyId: string): Promise<ApiKey | null>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | null>;
  listApiKeys(customerId?: string): Promise<ApiKey[]>;
  updateApiKey(keyId: string, updates: Partial<ApiKeyData>): Promise<ApiKey>;
  deleteApiKey(keyId: string): Promise<void>;

  // Usage tracking
  recordUsage(usage: UsageRecordData): Promise<void>;
  getUsage(customerId: string, period?: string): Promise<UsageRecord[]>;
  getUsageStats(customerId: string): Promise<UsageStats>;

  // Admin operations
  getBusinessOverview(): Promise<BusinessOverview>;
  getSystemMetrics(): Promise<SystemMetrics>;

  // Health check
  healthCheck(): Promise<boolean>;
  initialize(): Promise<void>;
}

// Data interfaces
export interface CustomerData {
  email: string;
  company?: string;
  plan: 'basic' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  passwordHash?: string; // FIXED: Add password hash to persistent storage
  phone_number?: string; // Store phone number
  full_name?: string; // Store full name
  nin_bvn?: string; // Store NIN/BVN
  id_document?: string; // Store ID document
}

export interface Customer extends CustomerData {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyData {
  customerId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  permissions: string[];
  plan: string;
  status: 'active' | 'suspended' | 'revoked';
  requestsUsed: number;
  requestsLimit: number;
  rateLimitPerMin: number;
  expiresAt?: Date;
}

export interface ApiKey extends ApiKeyData {
  id: string;
  lastUsed?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageRecordData {
  customerId: string;
  keyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  billingPeriod: string;
}

export interface UsageRecord extends UsageRecordData {
  id: string;
  timestamp: Date;
}

export interface UsageStats {
  requestsThisMonth: number;
  requestsToday: number;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  successRate: number;
  popularEndpoints: Array<{ endpoint: string; count: number; }>;
  errorRate: number;
  lastCallAt?: Date;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  search?: string;
  status?: string;
}

export interface BusinessOverview {
  totalCustomers: number;
  activeCustomers: number;
  monthlyRevenue: number;
  apiRequestsToday: number;
  apiRequestsThisMonth: number;
  errorRate: number;
  newSignupsThisMonth: number;
}

export interface SystemMetrics {
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  activeConnections: number;
  databaseHealth: boolean;
}

// Database factory
function createDatabase(): DatabaseInterface {
  // Force memory DB when Firebase is not explicitly enabled
  const effectiveType = (process.env.USE_FIREBASE === 'true')
    ? (process.env.DATABASE_TYPE || 'firestore')
    : 'memory';
  const databaseType = effectiveType;
  
  switch (databaseType.toLowerCase()) {
    case 'firestore':
      return new FirestoreDatabase();
    case 'memory':
      return new MemoryDatabase();
    case 'postgresql':
    case 'postgres':
      return new PostgreSQLDatabase();
    default:
      throw new Error(`Unsupported database type: ${databaseType}`);
  }
}

// Export singleton instance
export const database = createDatabase();

// Initialize database on import
database.initialize().catch(console.error);