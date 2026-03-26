import type { Context, Next } from 'hono'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

export function rateLimit(opts: { max: number; windowMs: number }) {
  return async (c: Context, next: Next) => {
    // Use API key or IP as identifier
    const key = c.req.header('x-api-key') || c.req.header('x-forwarded-for') || 'anonymous'
    const now = Date.now()

    let entry = store.get(key)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + opts.windowMs }
      store.set(key, entry)
    }

    entry.count++

    if (entry.count > opts.max) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      return c.json({ error: 'Rate limit exceeded' }, 429)
    }

    c.header('X-RateLimit-Limit', String(opts.max))
    c.header('X-RateLimit-Remaining', String(Math.max(0, opts.max - entry.count)))

    return next()
  }
}
