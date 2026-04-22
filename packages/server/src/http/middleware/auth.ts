import type { Context, Next } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import type { APIKeyScope, ValidatedKey } from 'opendocuments-core'

export interface PersonalModeAuth {
  mode: 'personal'
  record: null
  hasScope: () => boolean
}

const PERSONAL_MODE_AUTH: PersonalModeAuth = { mode: 'personal' as const, record: null, hasScope: () => true }

function getSessionApiKey(cookieHeader?: string): string | null {
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(';')
  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split('=')
    if (rawName === 'opendocuments_session') {
      return rawValue.join('=')
    }
  }
  return null
}

// Extend Hono context with auth info
declare module 'hono' {
  interface ContextVariableMap {
    auth: ValidatedKey | PersonalModeAuth | null
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
      c.set('auth', PERSONAL_MODE_AUTH)
      return next()
    }

    // Team mode: require API key
    const apiKey = c.req.header('x-api-key') || getSessionApiKey(c.req.header('cookie'))
    if (!apiKey) {
      return c.json({ error: 'API key required. Set X-API-Key header.' }, 401)
    }

    const validated = appCtx.apiKeyManager.validate(apiKey)
    if (!validated) {
      appCtx.auditLogger?.log({ eventType: 'auth:failed', details: { reason: 'invalid key' } })
      return c.json({ error: 'Invalid or expired API key' }, 401)
    }

    // TODO: Check validated.record.allowedIps against client IP when ip_restrictions column is added
    // if (validated.record.allowedIps && validated.record.allowedIps.length > 0) {
    //   const clientIp = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || ''
    //   if (!validated.record.allowedIps.includes(clientIp)) {
    //     return c.json({ error: 'IP not allowed for this API key' }, 403)
    //   }
    // }

    appCtx.auditLogger?.log({
      eventType: 'auth:login',
      userId: validated.record.userId,
      workspaceId: validated.record.workspaceId,
    })

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
    if (auth && 'mode' in auth && auth.mode === 'personal') return next()
    if (!auth || !auth.record) return c.json({ error: 'Authentication required' }, 401)

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
    if (auth && 'mode' in auth && auth.mode === 'personal') return next()
    if (!auth || !auth.record) return c.json({ error: 'Authentication required' }, 401)

    if (!roles.includes(auth.record.role)) {
      return c.json({ error: `Insufficient role. Required: ${roles.join(' or ')}` }, 403)
    }
    return next()
  }
}
