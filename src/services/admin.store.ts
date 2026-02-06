import bcrypt from 'bcrypt'
import { database } from '../database/index'

export type AdminRole = 'admin' | 'super_admin'

export interface AdminRecord {
  id: string
  email: string
  passwordHash: string
  role: AdminRole
  permissions: string[]
  createdAt: string
  lastLogin?: string
  status?: 'active' | 'suspended'
}

class DatabaseAdminStore {
  async findByEmail(email: string): Promise<AdminRecord | null> {
    const admin = await database.getAdminByEmail(email)
    if (!admin) return null
    return {
      id: admin.id,
      email: admin.email,
      passwordHash: admin.passwordHash,
      role: admin.role as AdminRole,
      permissions: admin.permissions,
      createdAt: admin.createdAt?.toISOString?.() || String(admin.createdAt),
      lastLogin: admin.lastLogin ? new Date(admin.lastLogin).toISOString() : undefined,
      status: admin.status
    }
  }

  async findById(adminId: string): Promise<AdminRecord | null> {
    const admin = await database.getAdmin(adminId)
    if (!admin) return null
    return {
      id: admin.id,
      email: admin.email,
      passwordHash: admin.passwordHash,
      role: admin.role as AdminRole,
      permissions: admin.permissions,
      createdAt: admin.createdAt?.toISOString?.() || String(admin.createdAt),
      lastLogin: admin.lastLogin ? new Date(admin.lastLogin).toISOString() : undefined,
      status: admin.status
    }
  }

  async list(): Promise<AdminRecord[]> {
    const admins = await database.listAdmins()
    return admins.map(a => ({
      id: a.id,
      email: a.email,
      passwordHash: a.passwordHash,
      role: a.role as AdminRole,
      permissions: a.permissions,
      createdAt: a.createdAt?.toISOString?.() || String(a.createdAt),
      lastLogin: a.lastLogin ? new Date(a.lastLogin).toISOString() : undefined,
      status: a.status
    }))
  }

  async create({ email, password, role = 'admin', permissions = [] as string[] }: { email: string; password: string; role?: AdminRole; permissions?: string[] }): Promise<AdminRecord> {
    if (!email || !password) throw new Error('MISSING_FIELDS')
    const existing = await this.findByEmail(email)
    if (existing) throw new Error('ADMIN_EXISTS')

    const passwordHash = await bcrypt.hash(password, 12)
    const admin = await database.createAdmin({
      email: email.toLowerCase(),
      passwordHash,
      role: role as any,
      permissions,
      status: 'active'
    })

    return {
      id: admin.id,
      email: admin.email,
      passwordHash: admin.passwordHash,
      role: admin.role as AdminRole,
      permissions: admin.permissions,
      createdAt: admin.createdAt?.toISOString?.() || String(admin.createdAt),
      lastLogin: admin.lastLogin ? new Date(admin.lastLogin).toISOString() : undefined,
      status: admin.status
    }
  }

  async updateLogin(email: string): Promise<void> {
    const admin = await this.findByEmail(email)
    if (!admin) return
    await database.updateAdmin(admin.id, { lastLogin: new Date() } as any)
  }

  async updatePassword(adminId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 12)
    await database.updateAdmin(adminId, { passwordHash, lastLogin: new Date() } as any)
  }
}

export const AdminStore = new DatabaseAdminStore()
