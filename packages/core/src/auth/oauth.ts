import { fetchWithTimeout } from '../utils/fetch.js'

export interface OAuthConfig {
  provider: 'google' | 'github'
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface OAuthUser {
  id: string
  email: string
  name: string
  provider: 'google' | 'github'
}

export class OAuthProvider {
  constructor(private config: OAuthConfig) {}

  getAuthorizationUrl(state: string): string {
    if (this.config.provider === 'google') {
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
      })
      return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    } else {
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        scope: 'user:email',
        state,
      })
      return `https://github.com/login/oauth/authorize?${params}`
    }
  }

  async exchangeCode(code: string): Promise<OAuthUser> {
    if (this.config.provider === 'google') {
      return this.exchangeGoogle(code)
    } else {
      return this.exchangeGitHub(code)
    }
  }

  private async exchangeGoogle(code: string): Promise<OAuthUser> {
    const tokenRes = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok) throw new Error(`Google token error: ${tokenRes.status}`)
    const tokens = await tokenRes.json() as { access_token?: string }
    if (!tokens.access_token) throw new Error('Google token response did not include an access token')

    const userRes = await fetchWithTimeout('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!userRes.ok) throw new Error(`Google userinfo error: ${userRes.status}`)
    const user = await userRes.json() as { id: string; email: string; name: string; verified_email?: boolean }
    if (!user.email || user.verified_email === false) throw new Error('Google account must have a verified email')

    return { id: user.id, email: user.email, name: user.name, provider: 'google' }
  }

  private async exchangeGitHub(code: string): Promise<OAuthUser> {
    const tokenRes = await fetchWithTimeout('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
      }),
    })
    if (!tokenRes.ok) throw new Error(`GitHub token error: ${tokenRes.status}`)
    const tokens = await tokenRes.json() as { access_token?: string }
    if (!tokens.access_token) throw new Error('GitHub token response did not include an access token')

    const userRes = await fetchWithTimeout('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokens.access_token}`, 'User-Agent': 'OpenDocuments' },
    })
    if (!userRes.ok) throw new Error(`GitHub user error: ${userRes.status}`)
    const user = await userRes.json() as { id: number; login: string; email: string | null; name: string | null }
    const emailRes = await fetchWithTimeout('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${tokens.access_token}`, 'User-Agent': 'OpenDocuments' },
    })
    if (!emailRes.ok) throw new Error(`GitHub email error: ${emailRes.status}`)
    const emails = await emailRes.json() as Array<{ email?: string; primary?: boolean; verified?: boolean }>
    const normalizedProfileEmail = user.email?.toLowerCase()
    const email = emails.find((candidate) => candidate.primary && candidate.verified)?.email ||
      emails.find((candidate) => (
        candidate.verified && candidate.email?.toLowerCase() === normalizedProfileEmail
      ))?.email ||
      emails.find((candidate) => candidate.verified)?.email ||
      null
    if (!email) throw new Error('GitHub account must have a verified email')

    return { id: String(user.id), email, name: user.name || user.login, provider: 'github' }
  }
}
