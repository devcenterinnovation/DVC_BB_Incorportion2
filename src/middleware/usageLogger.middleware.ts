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

  console.log('========================================')
  console.log('[USAGE-LOGGER] Middleware called for:', req.method, req.path)
  console.log('[USAGE-LOGGER] Authorization header:', req.headers.authorization?.substring(0, 30) + '...')
  console.log('========================================')

  res.on('finish', async () => {
    try {
      console.log('----------------------------------------')
      console.log('[USAGE] Response finished for:', req.method, req.path)
      console.log('[USAGE] Status code:', res.statusCode)
      
      let cj = (req as any).customerJwt
      const customer = (req as any).customer
      const apiKey = (req as any).apiKey

      console.log('[USAGE] req.customer:', customer ? JSON.stringify({ id: customer.id, email: customer.email }) : 'undefined')
      console.log('[USAGE] req.apiKey:', apiKey ? JSON.stringify({ id: apiKey.id, name: apiKey.name }) : 'undefined')
      console.log('[USAGE] req.customerJwt:', cj ? 'present' : 'undefined')

      // Fallback: decode Bearer JWT if present and middleware didn't populate
      if (!cj) {
        const auth = req.headers.authorization || ''
        if (auth.startsWith('Bearer ')) {
          try { cj = verifyJwt<any>(auth.slice(7)) } catch {}
        }
      }

      const customerId = cj?.customerId || customer?.id
      console.log('[USAGE] Final customerId:', customerId)
      
      if (!customerId) {
        console.log('[USAGE] ❌ No customerId found, SKIPPING usage recording!')
        console.log('----------------------------------------')
        return
      }

      const end = process.hrtime.bigint()
      const responseTimeMs = Math.round(Number(end - start) / 1_000_000) // Round to integer for PostgreSQL
      const method = req.method
      const statusCode = res.statusCode
      const endpoint = normalizePath(req.path)
      const keyId = apiKey?.id || 'n/a'

      const now = new Date()
      const billingPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

      const usageData = {
        customerId,
        keyId,
        endpoint,
        method,
        statusCode,
        responseTimeMs,
        billingPeriod,
        cost: 0
      }
      
      console.log('[USAGE] 📝 Saving to database:', JSON.stringify(usageData, null, 2))
      
      await database.recordUsage(usageData)
      
      console.log('[USAGE] ✅ Successfully saved to database!')
      console.log('----------------------------------------')

      // Increment API key usage counter (tracks cost/credits used)
      if (apiKey?.id) {
        try {
          const currentUsed = Number(apiKey?.requestsUsed || 0)
          await database.updateApiKey(apiKey.id, { requestsUsed: currentUsed + 1 })
          console.log('[USAGE] ✅ API key usage counter updated')
        } catch (e) {
          console.log('[USAGE] ⚠️ Failed to update API key counter:', e)
        }
      }
    } catch (err) {
      console.log('[USAGE] ❌ ERROR in usage logger:', err)
    }
  })

  next()
}


