/**
 * Firestore Implementation
 * Firebase-specific database operations
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

// Import Firestore (will be available in Firebase Functions environment)
let db: any;

export class FirestoreDatabase implements DatabaseInterface {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Use the centralized Firebase configuration
      const { initializeFirebaseAdmin } = await import('../config/firebase.js');
      const admin = await initializeFirebaseAdmin();
      
      db = admin.firestore();

      this.initialized = true;
      console.log('✅ Firestore initialized successfully');
    } catch (error) {
      console.error('❌ Firestore initialization failed:', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await db.collection('health').doc('test').get();
      return true;
    } catch (error) {
      console.error('Firestore health check failed:', error);
      return false;
    }
  }

  // Customer operations
  async createCustomer(customerData: CustomerData): Promise<Customer> {
    const docRef = db.collection('customers').doc();
    const now = new Date();
    
    const customer: Customer = {
      id: docRef.id,
      ...customerData,
      createdAt: now,
      updatedAt: now
    };

    await docRef.set({
      ...customer,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    });

    return customer;
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    const doc = await db.collection('customers').doc(customerId).get();
    
    if (!doc.exists) return null;
    
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt)
    };
  }

  async getCustomerByEmail(email: string): Promise<Customer | null> {
    const snapshot = await db.collection('customers')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt)
    };
  }

  async updateCustomer(customerId: string, updates: Partial<CustomerData>): Promise<Customer> {
    const docRef = db.collection('customers').doc(customerId);
    const now = new Date();
    
    await docRef.update({
      ...updates,
      updatedAt: now.toISOString()
    });

    const updated = await this.getCustomer(customerId);
    if (!updated) throw new Error('Customer not found after update');
    
    return updated;
  }

  async listCustomers(options: ListOptions = {}): Promise<{ customers: Customer[]; total: number; }> {
    let query = db.collection('customers');

    // Apply search filter
    if (options.search) {
      query = query.where('email', '>=', options.search)
                  .where('email', '<=', options.search + '\uf8ff');
    }

    // Apply status filter
    if (options.status) {
      query = query.where('status', '==', options.status);
    }

    // Apply pagination
    if (options.offset) {
      query = query.offset(options.offset);
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    const customers: Customer[] = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      customers.push({
        id: doc.id,
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt)
      });
    });

    // Get total count (approximate for Firestore)
    const totalSnapshot = await db.collection('customers').get();
    const total = totalSnapshot.size;

    return { customers, total };
  }

  async deleteCustomer(customerId: string): Promise<void> {
    await db.collection('customers').doc(customerId).delete();
  }

  // API Key operations
  async createApiKey(apiKeyData: ApiKeyData): Promise<ApiKey> {
    const docRef = db.collection('apiKeys').doc();
    const now = new Date();
    
    const apiKey: ApiKey = {
      id: docRef.id,
      ...apiKeyData,
      createdAt: now,
      updatedAt: now
    };

    await docRef.set({
      ...apiKey,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastUsed: apiKey.lastUsed?.toISOString(),
      expiresAt: apiKey.expiresAt?.toISOString()
    });

    return apiKey;
  }

  async getApiKey(keyId: string): Promise<ApiKey | null> {
    const doc = await db.collection('apiKeys').doc(keyId).get();
    
    if (!doc.exists) return null;
    
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      lastUsed: data.lastUsed ? new Date(data.lastUsed) : undefined,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined
    };
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    const snapshot = await db.collection('apiKeys')
      .where('keyHash', '==', keyHash)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      lastUsed: data.lastUsed ? new Date(data.lastUsed) : undefined,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined
    };
  }

  async listApiKeys(customerId?: string): Promise<ApiKey[]> {
    let query = db.collection('apiKeys');
    
    if (customerId) {
      query = query.where('customerId', '==', customerId);
    }

    const snapshot = await query.get();
    const apiKeys: ApiKey[] = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      apiKeys.push({
        id: doc.id,
        ...data,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        lastUsed: data.lastUsed ? new Date(data.lastUsed) : undefined,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined
      });
    });

    return apiKeys;
  }

  async updateApiKey(keyId: string, updates: Partial<ApiKeyData>): Promise<ApiKey> {
    const docRef = db.collection('apiKeys').doc(keyId);
    const now = new Date();
    
    const updateData: any = {
      ...updates,
      updatedAt: now.toISOString()
    };

    // Handle date fields
    if ('expiresAt' in updates && updates.expiresAt) {
      updateData.expiresAt = updates.expiresAt.toISOString();
    }

    await docRef.update(updateData);

    const updated = await this.getApiKey(keyId);
    if (!updated) throw new Error('API key not found after update');
    
    return updated;
  }

  async deleteApiKey(keyId: string): Promise<void> {
    await db.collection('apiKeys').doc(keyId).delete();
  }

  // Usage tracking
  async recordUsage(usageData: UsageRecordData): Promise<void> {
    const docRef = db.collection('usageRecords').doc();
    const now = new Date();
    
    await docRef.set({
      id: docRef.id,
      ...usageData,
      timestamp: now.toISOString()
    });
  }

  async getUsage(customerId: string, period?: string): Promise<UsageRecord[]> {
    let query = db.collection('usageRecords')
      .where('customerId', '==', customerId);

    if (period) {
      query = query.where('billingPeriod', '==', period);
    }

    const snapshot = await query.orderBy('timestamp', 'desc').get();
    const usage: UsageRecord[] = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      usage.push({
        id: doc.id,
        ...data,
        timestamp: new Date(data.timestamp)
      });
    });

    return usage;
  }

  async getUsageStats(customerId: string): Promise<UsageStats> {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const today = now.toISOString().split('T')[0];

    // Get this month's usage
    const monthlyUsage = await this.getUsage(customerId, thisMonth);
    
    // Get ALL usage for this customer
    const allUsageQuery = db.collection('usageRecords')
      .where('customerId', '==', customerId)
      .orderBy('timestamp', 'desc');
    const allUsageSnapshot = await allUsageQuery.get();
    
    const allUsage: UsageRecord[] = [];
    allUsageSnapshot.forEach(doc => {
      const data = doc.data();
      allUsage.push({
        id: doc.id,
        ...data,
        timestamp: new Date(data.timestamp)
      });
    });

    const todayUsage = monthlyUsage.filter(record => 
      record.timestamp.toISOString().startsWith(today)
    );

    // Calculate success/failure stats
    const successfulCalls = allUsage.filter(record => record.statusCode >= 200 && record.statusCode < 400).length;
    const failedCalls = allUsage.filter(record => record.statusCode >= 400).length;
    const totalCalls = allUsage.length;
    const successRate = totalCalls > 0 ? successfulCalls / totalCalls : 0;

    // Calculate endpoint popularity
    const endpointCounts = monthlyUsage.reduce((acc, record) => {
      acc[record.endpoint] = (acc[record.endpoint] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const popularEndpoints = Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate error rate
    const errorRequests = monthlyUsage.filter(record => record.statusCode >= 400);
    const errorRate = monthlyUsage.length > 0 ? errorRequests.length / monthlyUsage.length : 0;

    // Get last call timestamp
    const lastCallAt = allUsage.length > 0 ? allUsage[0].timestamp : undefined;

    return {
      requestsThisMonth: monthlyUsage.length,
      requestsToday: todayUsage.length,
      totalCalls,
      successfulCalls,
      failedCalls,
      successRate,
      popularEndpoints,
      errorRate,
      lastCallAt
    };
  }

  // Admin operations
  async getBusinessOverview(): Promise<BusinessOverview> {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Get customer stats
    const customersSnapshot = await db.collection('customers').get();
    const totalCustomers = customersSnapshot.size;
    
    const activeCustomers = customersSnapshot.docs.filter(doc => 
      doc.data().status === 'active'
    ).length;

    // Get new signups this month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newSignupsSnapshot = await db.collection('customers')
      .where('createdAt', '>=', startOfMonth.toISOString())
      .get();
    const newSignupsThisMonth = newSignupsSnapshot.size;

    // Get usage stats
    const usageSnapshot = await db.collection('usageRecords')
      .where('billingPeriod', '==', thisMonth)
      .get();
    const apiRequestsThisMonth = usageSnapshot.size;

    const today = now.toISOString().split('T')[0];
    const todayUsageSnapshot = await db.collection('usageRecords')
      .where('timestamp', '>=', today)
      .get();
    const apiRequestsToday = todayUsageSnapshot.size;

    // Calculate error rate
    let errorRequests = 0;
    usageSnapshot.forEach(doc => {
      if (doc.data().statusCode >= 400) {
        errorRequests++;
      }
    });
    const errorRate = apiRequestsThisMonth > 0 ? errorRequests / apiRequestsThisMonth : 0;

    // TODO: Calculate revenue from Stripe data
    const monthlyRevenue = 0;

    return {
      totalCustomers,
      activeCustomers,
      monthlyRevenue,
      apiRequestsToday,
      apiRequestsThisMonth,
      errorRate,
      newSignupsThisMonth
    };
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    const databaseHealth = await this.healthCheck();
    
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      activeConnections: 0, // Not applicable for Firestore
      databaseHealth
    };
  }
}