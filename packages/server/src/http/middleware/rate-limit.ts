import type { Context, Next } from 'hono'
import { createHash } from 'node:crypto'

interface RateLimitEntry {
  count: number
  resetAt: number
}

export function rateLimit(opts: { max: number; windowMs: number }) {
  const store = new Map<string, RateLimitEntry>()

  return async (c: Context, next: Next) => {
    // Use API key or first IP from x-forwarded-for as identifier
    const rawKey = c.req.header('x-api-key') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous'
    const key = createHash('sha256').update(rawKey).digest('hex').substring(0, 16) // short hash for memory efficiency
    const now = Date.now()

    // Lazy cleanup: remove expired entries when store grows large
    if (store.size > 100) {
      for (const [k, v] of store) {
        if (now > v.resetAt) store.delete(k)
      }
    }

    let entry = store.get(key)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + opts.windowMs }
      store.set(key, entry)
    }

    entry.count++

    // Support per-key rate limits from APIKeyManager (overrides global opts.max)
    const auth = c.get('auth') as any
    const keyRateLimit = auth?.record?.rateLimit
    const effectiveMax = keyRateLimit || opts.max

    if (entry.count > effectiveMax) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      return c.json({ error: 'Rate limit exceeded' }, 429)
    }

    c.header('X-RateLimit-Limit', String(effectiveMax))
    c.header('X-RateLimit-Remaining', String(Math.max(0, effectiveMax - entry.count)))

    return next()
  }
}
