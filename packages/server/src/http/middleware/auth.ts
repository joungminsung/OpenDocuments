import type { Context, Next } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import type { APIKeyScope, ValidatedKey } from '@opendocs/core'

// Extend Hono context with auth info
declare module 'hono' {
  interface ContextVariableMap {
    auth: ValidatedKey | null
  }
}

/**
 * Auth middleware. In personal mode, all requests pass through.
 * In team mode, requires X-API-Key header.
 */
export function authMiddleware(appCtx: AppContext) {
  return async (c: Context, next: Next) => {
    // Personal mode: no auth required
    if (appCtx.config.mode === 'personal') {
      c.set('auth', null)
      return next()
    }

    // Team mode: require API key
    const apiKey = c.req.header('x-api-key')
    if (!apiKey) {
      return c.json({ error: 'API key required. Set X-API-Key header.' }, 401)
    }

    const validated = appCtx.apiKeyManager.validate(apiKey)
    if (!validated) {
      return c.json({ error: 'Invalid or expired API key' }, 401)
    }

    c.set('auth', validated)
    return next()
  }
}

/**
 * Require specific scope. Must be used after authMiddleware.
 */
export function requireScope(scope: APIKeyScope) {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth')
    // Personal mode: allow all
    if (!auth) return next()

    if (!auth.hasScope(scope)) {
      return c.json({ error: `Insufficient permissions. Required scope: ${scope}` }, 403)
    }
    return next()
  }
}

/**
 * Require specific role. Must be used after authMiddleware.
 */
export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth')
    if (!auth) return next()

    if (!roles.includes(auth.record.role)) {
      return c.json({ error: `Insufficient role. Required: ${roles.join(' or ')}` }, 403)
    }
    return next()
  }
}
