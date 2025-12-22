import bcrypt from 'bcrypt'
import { getFirestore } from 'firebase-admin/firestore'

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

export class FirestoreAdminStore {
  private col() {
    return getFirestore().collection('admins')
  }

  async findByEmail(email: string): Promise<AdminRecord | null> {
    const snap = await this.col().where('email', '==', email.toLowerCase()).limit(1).get()
    if (snap.empty) return null
    const doc = snap.docs[0]
    return { id: doc.id, ...(doc.data() as any) }
  }

  async findById(adminId: string): Promise<AdminRecord | null> {
    const doc = await this.col().doc(adminId).get()
    if (!doc.exists) return null
    return { id: doc.id, ...(doc.data() as any) }
  }

  async list(): Promise<AdminRecord[]> {
    const snap = await this.col().get()
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
  }

  async create({ email, password, role = 'admin', permissions = [] as string[] }:
    { email: string; password: string; role?: AdminRole; permissions?: string[] }): Promise<AdminRecord> {
    if (!email || !password) throw new Error('MISSING_FIELDS')
    const exists = await this.findByEmail(email)
    if (exists) throw new Error('ADMIN_EXISTS')
    const passwordHash = await bcrypt.hash(password, 12)
    const rec = {
      email: email.toLowerCase(),
      passwordHash,
      role,
      permissions,
      createdAt: new Date().toISOString(),
    }
    const doc = await this.col().add(rec)
    return { id: doc.id, ...(rec as any) }
  }

  async updateLogin(email: string): Promise<void> {
    const rec = await this.findByEmail(email)
    if (!rec) return
    await this.col().doc(rec.id).update({ lastLogin: new Date().toISOString() })
  }

  async updatePassword(adminId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 12)
    await this.col().doc(adminId).update({ passwordHash, lastLogin: new Date().toISOString() })
  }

  async verifyCredentials(email: string, password: string): Promise<AdminRecord | null> {
    const rec = await this.findByEmail(email)
    if (!rec) return null
    const ok = await bcrypt.compare(password, rec.passwordHash)
    return ok ? rec : null
  }
}
