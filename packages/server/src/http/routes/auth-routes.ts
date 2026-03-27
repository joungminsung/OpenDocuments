import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { OAuthProvider } from '@opendocs/core'
import { randomBytes } from 'node:crypto'

export function authRoutes(ctx: AppContext) {
  const app = new Hono()

  // GET /auth/login/:provider -- redirect to OAuth provider
  app.get('/auth/login/:provider', (c) => {
    const provider = c.req.param('provider') as 'google' | 'github'
    const config = (ctx.config as any).security?.auth?.providers?.find(
      (p: any) => p.type === provider
    )
    if (!config) return c.json({ error: `OAuth provider ${provider} not configured` }, 400)

    const oauth = new OAuthProvider({
      provider,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: `${c.req.url.split('/auth')[0]}/auth/callback/${provider}`,
    })

    const state = randomBytes(16).toString('hex')
    // TODO: Store state in session for CSRF validation
    return c.redirect(oauth.getAuthorizationUrl(state))
  })

  // GET /auth/callback/:provider -- exchange code for user info
  app.get('/auth/callback/:provider', async (c) => {
    const provider = c.req.param('provider') as 'google' | 'github'
    const code = c.req.query('code')
    if (!code) return c.json({ error: 'Missing authorization code' }, 400)

    const config = (ctx.config as any).security?.auth?.providers?.find(
      (p: any) => p.type === provider
    )
    if (!config) return c.json({ error: `OAuth provider ${provider} not configured` }, 400)

    try {
      const oauth = new OAuthProvider({
        provider,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: `${c.req.url.split('/auth')[0]}/auth/callback/${provider}`,
      })

      const user = await oauth.exchangeCode(code)

      // Create or find workspace and generate API key for the user
      const ws = ctx.workspaceManager.list()[0]
      if (!ws) return c.json({ error: 'No workspace available' }, 500)

      const { rawKey } = ctx.apiKeyManager.create({
        name: `${provider}-${user.email}`,
        workspaceId: ws.id,
        userId: user.id,
        role: 'member',
      })

      // Redirect to Web UI with the key (for session cookie setup)
      return c.redirect(`/?auth_token=${rawKey}&provider=${provider}`)
    } catch (err) {
      return c.json({ error: `OAuth error: ${(err as Error).message}` }, 500)
    }
  })

  return app
}
