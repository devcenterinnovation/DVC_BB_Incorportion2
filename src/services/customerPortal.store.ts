import bcrypt from 'bcrypt'

export type CustomerStatus = 'active' | 'suspended'
export type Plan = 'basic' | 'pro' | 'enterprise'

export interface CustomerApiKey {
  id: string
  name: string
  keyHash: string // Store hashed version of full key
  lastFour: string
  status: 'active' | 'revoked'
  createdAt: string
}

export interface CustomerRecord {
  id: string
  email: string
  passwordHash: string
  company?: string
  phoneNumber?: string
  plan: Plan
  status: CustomerStatus
  createdAt: string
  lastLogin?: string
  apiKeys: CustomerApiKey[]
  usage: Record<string, number>
}

class InMemoryCustomerStore {
  private customers: CustomerRecord[] = []

  constructor() {
    // seed one test customer (dev only)
    const password = 'CustomerPass123!'
    const hash = bcrypt.hashSync(password, 10)
    this.customers.push({
      id: 'cust_001',
      email: 'customer@example.com',
      passwordHash: hash,
      company: 'Customer Co',
      phoneNumber: '08012345678',
      plan: 'basic',
      status: 'active',
      createdAt: new Date().toISOString(),
      apiKeys: [],
      usage: {}
    })
  }

  /** Create a new portal customer, enforcing email uniqueness. Password should be pre-hashed. */
  create(email: string, passwordOrHash: string, company?: string, plan: Plan = 'basic', idOverride?: string, phoneNumber?: string, isHashed: boolean = false): CustomerRecord {
    const existing = this.findByEmail(email)
    if (existing) {
      throw new Error('EMAIL_EXISTS')
    }
    const id = idOverride || `cust_${Math.random().toString(36).slice(2, 10)}`
    // Only hash if not already hashed (for backward compatibility)
    const passwordHash = isHashed ? passwordOrHash : bcrypt.hashSync(passwordOrHash, 10)
    const record: CustomerRecord = {
      id,
      email: email.toLowerCase(),
      passwordHash,
      company,
      phoneNumber,
      plan,
      status: 'active',
      createdAt: new Date().toISOString(),
      apiKeys: [],
      usage: {}
    }
    this.customers.push(record)
    return record
  }

  findByEmail(email: string) {
    return this.customers.find(c => c.email.toLowerCase() === email.toLowerCase()) || null
  }

  findById(id: string) {
    return this.customers.find(c => c.id === id) || null
  }

  update(id: string, patch: Partial<CustomerRecord>) {
    const c = this.findById(id)
    if (!c) return null
    Object.assign(c, patch)
    return c
  }

  listKeys(customerId: string) {
    const c = this.findById(customerId)
    return c ? c.apiKeys : []
  }

  addKey(customerId: string, name = 'Default Key') {
    const c = this.findById(customerId)
    if (!c) return null
    const raw = this.generateKey()
    const keyHash = bcrypt.hashSync(raw, 10) // Hash the full key
    const key: CustomerApiKey = {
      id: `key_${Math.random().toString(36).slice(2, 10)}`,
      name,
      keyHash,
      lastFour: raw.slice(-4),
      status: 'active',
      createdAt: new Date().toISOString()
    }
    c.apiKeys.unshift(key)
    return { key, raw } // return raw once
  }

  revokeKey(customerId: string, keyId: string) {
    const c = this.findById(customerId)
    if (!c) return false
    const k = c.apiKeys.find(k => k.id === keyId)
    if (!k) return false
    k.status = 'revoked'
    return true
  }

  getUsage(customerId: string) {
    const c = this.findById(customerId)
    return c ? c.usage : {}
  }

  // Method to get all customers for API key verification
  getAllCustomers() {
    return this.customers
  }

  private generateKey() {
    // simple dev key
    return 'ck_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  }
}

export const CustomerStore = new InMemoryCustomerStore()
