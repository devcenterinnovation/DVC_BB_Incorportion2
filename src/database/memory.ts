import type { DatabaseInterface, CustomerData, Customer, ApiKeyData, ApiKey, UsageRecordData, UsageRecord, UsageStats, ListOptions, BusinessOverview, SystemMetrics } from './index.js'
import { promises as fs } from 'fs'
import path from 'path'

function now() { return new Date() }

const DB_FILE = process.env.MEMDB_FILE || path.join('.data', 'memorydb.json')

async function ensureDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

export class MemoryDatabase implements DatabaseInterface {
  private customers = new Map<string, Customer>()
  private apiKeys = new Map<string, ApiKey>()
  private usage: UsageRecord[] = []

  private async load() {
    try {
      const raw = await fs.readFile(DB_FILE, 'utf8')
      const data = JSON.parse(raw)
      const customers: Customer[] = (data.customers || []).map((c: any) => ({
        ...c,
        createdAt: new Date(c.createdAt),
        updatedAt: new Date(c.updatedAt)
      }))
      const apiKeys: ApiKey[] = (data.apiKeys || []).map((k: any) => ({
        ...k,
        createdAt: new Date(k.createdAt),
        updatedAt: new Date(k.updatedAt),
        lastUsed: k.lastUsed ? new Date(k.lastUsed) : undefined,
        expiresAt: k.expiresAt ? new Date(k.expiresAt) : undefined,
      }))
      const usage: UsageRecord[] = (data.usage || []).map((u: any) => ({
        ...u,
        timestamp: new Date(u.timestamp)
      }))
      this.customers = new Map(customers.map(c => [c.id, c]))
      this.apiKeys = new Map(apiKeys.map(k => [k.id, k]))
      this.usage = usage
    } catch (e) {
      // no existing file - seed minimal
      const id = 'cust_001'
      this.customers.set(id, {
        id,
        email: 'customer@example.com',
        company: 'Customer Co',
        plan: 'basic',
        status: 'active',
        createdAt: now(),
        updatedAt: now(),
      } as Customer)
      await this.save()
    }
  }

  private async save() {
    try {
      await ensureDir(DB_FILE)
      const data = {
        customers: [...this.customers.values()],
        apiKeys: [...this.apiKeys.values()],
        usage: this.usage
      }
      await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf8')
    } catch (e) {
      // best-effort persistence for dev
      console.warn('[MemoryDatabase] persist failed:', (e as Error).message)
    }
  }

  async initialize(): Promise<void> {
    await this.load()
  }

  async healthCheck(): Promise<boolean> { return true }

  async createCustomer(customer: CustomerData): Promise<Customer> {
    const id = 'cust_' + Math.random().toString(36).slice(2,10)
    const rec: Customer = { id, createdAt: now(), updatedAt: now(), ...customer }
    this.customers.set(id, rec)
    await this.save()
    return rec
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    return this.customers.get(customerId) || null
  }

  async getCustomerByEmail(email: string): Promise<Customer | null> {
    for (const c of this.customers.values()) {
      if (c.email.toLowerCase() === email.toLowerCase()) return c
    }
    return null
  }

  async updateCustomer(customerId: string, updates: Partial<CustomerData>): Promise<Customer> {
    const cur = this.customers.get(customerId)
    if (!cur) throw new Error('CUSTOMER_NOT_FOUND')
    const next: Customer = { ...cur, ...updates, updatedAt: now() }
    this.customers.set(customerId, next)
    await this.save()
    return next
  }

  async listCustomers(options?: ListOptions): Promise<{ customers: Customer[]; total: number; }> {
    const list = [...this.customers.values()]
    return { customers: list, total: list.length }
  }

  async deleteCustomer(customerId: string): Promise<void> {
    this.customers.delete(customerId)
    await this.save()
  }

  async createApiKey(apiKey: ApiKeyData): Promise<ApiKey> {
    const id = 'key_' + Math.random().toString(36).slice(2,10)
    const rec: ApiKey = { id, createdAt: now(), updatedAt: now(), ...apiKey }
    this.apiKeys.set(id, rec)
    await this.save()
    return rec
  }

  async getApiKey(keyId: string): Promise<ApiKey | null> {
    return this.apiKeys.get(keyId) || null
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
    for (const k of this.apiKeys.values()) { if (k.keyHash === keyHash) return k }
    return null
  }

  async listApiKeys(customerId?: string): Promise<ApiKey[]> {
    const list = [...this.apiKeys.values()]
    return customerId ? list.filter(k => k.customerId === customerId) : list
  }

  async updateApiKey(keyId: string, updates: Partial<ApiKeyData>): Promise<ApiKey> {
    const cur = this.apiKeys.get(keyId)
    if (!cur) throw new Error('API_KEY_NOT_FOUND')
    const next: ApiKey = { ...cur, ...updates, updatedAt: now() }
    this.apiKeys.set(keyId, next)
    await this.save()
    return next
  }

  async deleteApiKey(keyId: string): Promise<void> {
    this.apiKeys.delete(keyId)
    await this.save()
  }

  async recordUsage(usage: UsageRecordData): Promise<void> {
    const id = 'use_' + Math.random().toString(36).slice(2,10)
    this.usage.push({ id, timestamp: now(), ...usage })
    await this.save()
  }

  async getUsage(customerId: string, period = '30d'): Promise<UsageRecord[]> {
    return this.usage.filter(u => u.customerId === customerId)
  }

  async getUsageStats(customerId: string): Promise<UsageStats> {
    const records = this.usage.filter(u => u.customerId === customerId)
    const totalCalls = records.length
    const successfulCalls = records.filter(r => r.statusCode >= 200 && r.statusCode < 400).length
    const failedCalls = records.filter(r => r.statusCode >= 400).length
    const successRate = totalCalls > 0 ? successfulCalls / totalCalls : 0
    const requestsThisMonth = records.length
    const requestsToday = records.length
    const popularEndpoints = Object.entries(records.reduce((acc, r) => { acc[r.endpoint] = (acc[r.endpoint]||0)+1; return acc }, {} as Record<string, number>)).map(([endpoint,count])=>({endpoint,count})).slice(0, 5)
    const errorRate = records.length ? records.filter(r => r.statusCode >= 400).length / records.length : 0
    const sortedRecords = [...records].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    const lastCallAt = sortedRecords.length > 0 ? sortedRecords[0].timestamp : undefined
    return { requestsThisMonth, requestsToday, totalCalls, successfulCalls, failedCalls, successRate, popularEndpoints, errorRate, lastCallAt }
  }

  async getBusinessOverview(): Promise<BusinessOverview> {
    const totalCustomers = this.customers.size
    const activeCustomers = [...this.customers.values()].filter(c => c.status === 'active').length
    const apiRequestsToday = this.usage.length
    const apiRequestsThisMonth = this.usage.length
    const errorRate = this.usage.length ? this.usage.filter(u => u.statusCode>=400).length / this.usage.length : 0
    return { totalCustomers, activeCustomers, monthlyRevenue: 0, apiRequestsToday, apiRequestsThisMonth, errorRate, newSignupsThisMonth: 0 }
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    return { uptime: process.uptime(), memoryUsage: process.memoryUsage(), activeConnections: 0, databaseHealth: true }
  }
}
