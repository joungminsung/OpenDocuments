import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { OAuthProvider } from 'opendocuments-core'
import { randomBytes } from 'node:crypto'
import { isSecureRequest } from '../request-security.js'

function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined
  const value = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('opendocuments_session='))
    ?.slice('opendocuments_session='.length)
  if (!value) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}

export function authRoutes(ctx: AppContext) {
  const app = new Hono()
  const pendingStates = new Map<string, { provider: 'google' | 'github'; createdAt: number }>()
  type ProviderConfig = AppContext['config']['security']['auth']['providers'][number]

  const findProvider = (provider: string): ProviderConfig | undefined =>
    ctx.config.security.auth.providers.find((candidate) => candidate.type === provider)

  const redirectUriFor = (requestUrl: string, provider: string, config: ProviderConfig): string =>
    config.redirectUri || `${requestUrl.split('/auth')[0]}/auth/callback/${provider}`

  const isAllowedUser = (email: string, config: ProviderConfig): boolean => {
    if (config.allowAnyUser) return true
    const normalizedEmail = email.trim().toLowerCase()
    if (config.allowedEmails.some((allowed) => allowed.toLowerCase() === normalizedEmail)) return true
    const domain = normalizedEmail.split('@')[1]
    return Boolean(domain && config.allowedDomains.some((allowed) => allowed.toLowerCase() === domain))
  }

  app.get('/auth/providers', (c) => {
    return c.json({ providers: ctx.config.security.auth.providers.map((provider) => provider.type) })
  })

  app.post('/auth/session', async (c) => {
    if (ctx.config.mode !== 'team') {
      return c.json({ authenticated: true })
    }
    const body = await c.req.json<{ apiKey?: unknown }>().catch(() => ({})) as { apiKey?: unknown }
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    const validated = apiKey ? ctx.apiKeyManager.validate(apiKey) : null
    if (!validated) {
      ctx.auditLogger.log({
        eventType: 'auth:failed',
        details: { reason: 'invalid browser session key' },
      })
      return c.json({ error: 'Invalid or expired API key' }, 401)
    }

    const expiresAt = new Date(Date.now() + 28800000).toISOString()
    const { rawKey: sessionKey } = ctx.apiKeyManager.create({
      name: `browser-session-${validated.record.keyPrefix}`,
      workspaceId: validated.record.workspaceId,
      userId: validated.record.userId,
      role: validated.record.role,
      scopes: validated.record.scopes,
      rateLimit: validated.record.rateLimit,
      allowedIps: validated.record.allowedIps,
      expiresAt,
    })
    const secure = isSecureRequest(c, ctx.config.security.transport.proxy) ? '; Secure' : ''
    c.header(
      'Set-Cookie',
      `opendocuments_session=${sessionKey}; HttpOnly; Path=/; Max-Age=28800; SameSite=Strict${secure}`
    )
    c.header('Cache-Control', 'no-store')
    ctx.auditLogger.log({
      eventType: 'auth:login',
      userId: validated.record.userId,
      workspaceId: validated.record.workspaceId,
      details: { method: 'api-key-session' },
    })
    return c.json({ authenticated: true })
  })

  app.post('/auth/logout', (c) => {
    const sessionKey = readSessionCookie(c.req.header('Cookie'))
    const validated = sessionKey ? ctx.apiKeyManager.validate(sessionKey) : null
    if (validated) ctx.apiKeyManager.revoke(validated.record.id)
    const secure = isSecureRequest(c, ctx.config.security.transport.proxy) ? '; Secure' : ''
    c.header(
      'Set-Cookie',
      `opendocuments_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${secure}`
    )
    c.header('Cache-Control', 'no-store')
    return c.json({ authenticated: false })
  })

  // GET /auth/login/:provider -- redirect to OAuth provider
  app.get('/auth/login/:provider', (c) => {
    const provider = c.req.param('provider')
    if (provider !== 'google' && provider !== 'github') {
      return c.json({ error: `Unsupported OAuth provider ${provider}` }, 400)
    }
    const config = findProvider(provider)
    if (!config) return c.json({ error: `OAuth provider ${provider} not configured` }, 400)
    if (ctx.config.mode === 'team' && !config.redirectUri) {
      return c.json({ error: `OAuth provider ${provider} requires an explicit redirectUri in team mode` }, 500)
    }

    const oauth = new OAuthProvider({
      provider,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: redirectUriFor(c.req.url, provider, config),
    })

    // Clean old states (>10min) and enforce max size to prevent memory exhaustion
    const now = Date.now()
    for (const [s, pending] of pendingStates) {
      if (now - pending.createdAt > 600000) pendingStates.delete(s)
    }
    if (pendingStates.size >= 1000) {
      return c.json({ error: 'Too many pending login attempts. Try again later.' }, 429)
    }
    const state = randomBytes(16).toString('hex')
    pendingStates.set(state, { provider, createdAt: now })

    return c.redirect(oauth.getAuthorizationUrl(state))
  })

  // GET /auth/callback/:provider -- exchange code for user info
  app.get('/auth/callback/:provider', async (c) => {
    const provider = c.req.param('provider')
    if (provider !== 'google' && provider !== 'github') {
      return c.json({ error: `Unsupported OAuth provider ${provider}` }, 400)
    }
    const code = c.req.query('code')
    if (!code) return c.json({ error: 'Missing authorization code' }, 400)

    // Validate OAuth state to prevent CSRF
    const state = c.req.query('state')
    const pending = state ? pendingStates.get(state) : undefined
    if (
      !state ||
      !pending ||
      pending.provider !== provider ||
      Date.now() - pending.createdAt > 600000
    ) {
      if (state) pendingStates.delete(state)
      return c.json({ error: 'Invalid or expired state parameter' }, 400)
    }
    pendingStates.delete(state)

    const config = findProvider(provider)
    if (!config) return c.json({ error: `OAuth provider ${provider} not configured` }, 400)
    if (ctx.config.mode === 'team' && !config.redirectUri) {
      return c.json({ error: `OAuth provider ${provider} requires an explicit redirectUri in team mode` }, 500)
    }

    try {
      const oauth = new OAuthProvider({
        provider,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: redirectUriFor(c.req.url, provider, config),
      })

      const user = await oauth.exchangeCode(code)
      if (!isAllowedUser(user.email, config)) {
        ctx.auditLogger.log({
          eventType: 'auth:failed',
          userId: user.id,
          details: { reason: 'oauth user not allowed', provider },
        })
        return c.json({ error: 'This account is not allowed to access OpenDocuments' }, 403)
      }

      const workspaceName = config.workspace || ctx.config.workspace
      const ws = ctx.workspaceManager.getByName(workspaceName)
      if (!ws) return c.json({ error: 'No workspace available' }, 500)

      const { rawKey } = ctx.apiKeyManager.create({
        name: `${provider}-${user.email}`,
        workspaceId: ws.id,
        userId: user.id,
        role: config.role,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      })

      // Set HTTP-only cookie instead of leaking API key in URL
      const secure = isSecureRequest(c, ctx.config.security.transport.proxy) ? '; Secure' : ''
      c.header('Set-Cookie', `opendocuments_session=${rawKey}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${secure}`)
      return c.redirect('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`OAuth ${provider} callback failed:`, message)
      return c.json({
        error: process.env.NODE_ENV === 'production'
          ? 'OAuth authentication failed'
          : `OAuth error: ${message}`,
      }, 500)
    }
  })

  return app
}
