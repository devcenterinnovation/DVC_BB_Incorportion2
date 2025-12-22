import bcrypt from 'bcrypt'
import { FirestoreAdminStore } from './admin.firestore.store.js'

export type AdminRole = 'admin' | 'super_admin'

export interface AdminRecord {
  id: string
  email: string
  passwordHash: string
  role: AdminRole
  permissions: string[]
  createdAt: string
  lastLogin?: string
}

class InMemoryAdminStore {
  private admins = new Map<string, AdminRecord>()

  constructor() {
    // seed nothing here; env-based admin still supported via admin.middleware
  }

  findByEmail(email: string): AdminRecord | null {
    for (const a of this.admins.values()) {
      if (a.email.toLowerCase() === email.toLowerCase()) return a
    }
    return null
  }

  list(): AdminRecord[] {
    return [...this.admins.values()]
  }

  create({ email, password, role = 'admin', permissions = [] as string[] }: { email: string; password: string; role?: AdminRole; permissions?: string[] }): AdminRecord {
    if (!email || !password) throw new Error('MISSING_FIELDS')
    if (this.findByEmail(email)) throw new Error('ADMIN_EXISTS')
    const id = 'adm_' + Math.random().toString(36).slice(2, 10)
    const passwordHash = bcrypt.hashSync(password, 10)
    const rec: AdminRecord = {
      id,
      email,
      passwordHash,
      role,
      permissions,
      createdAt: new Date().toISOString(),
    }
    this.admins.set(id, rec)
    return rec
  }

  updateLogin(email: string) {
    const rec = this.findByEmail(email)
    if (rec) {
      rec.lastLogin = new Date().toISOString()
      this.admins.set(rec.id, rec)
    }
  }

  async updatePassword(adminId: string, newPassword: string): Promise<void> {
    const rec = [...this.admins.values()].find(a => a.id === adminId)
    if (!rec) throw new Error('ADMIN_NOT_FOUND')
    rec.passwordHash = await bcrypt.hash(newPassword, 12)
    rec.lastLogin = new Date().toISOString()
    this.admins.set(rec.id, rec)
  }

  async findById(adminId: string): Promise<AdminRecord | null> {
    for (const a of this.admins.values()) {
      if (a.id === adminId) return a
    }
    return null
  }
}

const useFirebase = process.env.USE_FIREBASE === 'true'
export const AdminStore = useFirebase ? new FirestoreAdminStore() : new InMemoryAdminStore()
