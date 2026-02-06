import { database } from '../database/index';

function currentBillingPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}

export const AdminAuditService = {
  async recordAdminAction(adminId: string, endpoint: string, method: string, statusCode: number, responseTimeMs: number, details?: Record<string, any>) {
    try {
      await database.recordUsage({
        customerId: `admin:${adminId}`,
        keyId: 'admin',
        endpoint,
        method,
        statusCode,
        responseTimeMs,
        billingPeriod: currentBillingPeriod(),
        cost: 0
      });
    } catch (e) {
      console.warn('[admin-audit] Failed to record admin action:', (e as Error).message);
    }
  }
};



