import type { Request, Response, NextFunction } from 'express'
import { database } from '../database/index.js'
import { verifyJwt } from '../utils/jwt.util.js'

function normalizePath(path: string): string {
  return path
    // UUIDs
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, ':id')
    // numbers
    .replace(/\b\d+\b/g, ':id')
}

export function usageLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint()

  res.on('finish', async () => {
    try {
      let cj = (req as any).customerJwt
      const customer = (req as any).customer
      const apiKey = (req as any).apiKey

      // Fallback: decode Bearer JWT if present and middleware didn't populate
      if (!cj) {
        const auth = req.headers.authorization || ''
        if (auth.startsWith('Bearer ')) {
          try { cj = verifyJwt<any>(auth.slice(7)) } catch {}
        }
      }

      const customerId = cj?.customerId || customer?.id
      if (!customerId) return

      const end = process.hrtime.bigint()
      const responseTimeMs = Number(end - start) / 1_000_000
      const method = req.method
      const statusCode = res.statusCode
      const endpoint = normalizePath(req.path)
      const keyId = apiKey?.id || 'n/a'

      const now = new Date()
      const billingPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

      await database.recordUsage({
        customerId,
        keyId,
        endpoint,
        method,
        statusCode,
        responseTimeMs,
        billingPeriod,
      })

      // Increment API key usage counter (tracks cost/credits used)
      if (apiKey?.id) {
        try {
          const currentUsed = Number(apiKey?.requestsUsed || 0)
          await database.updateApiKey(apiKey.id, { requestsUsed: currentUsed + 1 })
        } catch (e) {
          // non-fatal in dev
        }
      }
    } catch {
      // ignore logging errors in local
    }
  })

  next()
}
