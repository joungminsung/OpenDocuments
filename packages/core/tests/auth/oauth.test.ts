import { afterEach, describe, it, expect, vi } from 'vitest'
import { OAuthProvider } from '../../src/auth/oauth.js'

describe('OAuthProvider', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('generates Google authorization URL', () => {
    const provider = new OAuthProvider({
      provider: 'google', clientId: 'cid', clientSecret: 'cs', redirectUri: 'http://localhost:3000/callback',
    })
    const url = provider.getAuthorizationUrl('state123')
    expect(url).toContain('accounts.google.com')
    expect(url).toContain('client_id=cid')
    expect(url).toContain('state=state123')
  })

  it('generates GitHub authorization URL', () => {
    const provider = new OAuthProvider({
      provider: 'github', clientId: 'cid', clientSecret: 'cs', redirectUri: 'http://localhost:3000/callback',
    })
    const url = provider.getAuthorizationUrl('state456')
    expect(url).toContain('github.com/login/oauth/authorize')
    expect(url).toContain('client_id=cid')
  })

  it('exchanges Google code for user', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '123', email: 'user@gmail.com', name: 'Test User' }) })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new OAuthProvider({ provider: 'google', clientId: 'cid', clientSecret: 'cs', redirectUri: 'http://localhost/cb' })
    const user = await provider.exchangeCode('code123')
    expect(user.email).toBe('user@gmail.com')
    expect(user.provider).toBe('google')
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: expect.any(URLSearchParams),
    }))
    vi.unstubAllGlobals()
  })

  it('exchanges GitHub code for user', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 456, login: 'testuser', email: 'user@github.com', name: 'GH User' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ email: 'user@github.com', primary: true, verified: true }],
      })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new OAuthProvider({ provider: 'github', clientId: 'cid', clientSecret: 'cs', redirectUri: 'http://localhost/cb' })
    const user = await provider.exchangeCode('code456')
    expect(user.email).toBe('user@github.com')
    expect(user.provider).toBe('github')
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: expect.any(URLSearchParams),
    }))
    vi.unstubAllGlobals()
  })

  it('loads a verified GitHub email when the profile email is private', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 456, login: 'testuser', email: null, name: null }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ email: 'verified@example.com', primary: true, verified: true }],
      })
    )
    const provider = new OAuthProvider({ provider: 'github', clientId: 'cid', clientSecret: 'cs', redirectUri: 'http://localhost/cb' })
    const user = await provider.exchangeCode('code456')
    expect(user.email).toBe('verified@example.com')
    vi.unstubAllGlobals()
  })

  it('rejects a GitHub profile without any verified email', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 456, login: 'testuser', email: 'unverified@example.com', name: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ email: 'unverified@example.com', primary: true, verified: false }],
      })
    )
    const provider = new OAuthProvider({
      provider: 'github',
      clientId: 'cid',
      clientSecret: 'cs',
      redirectUri: 'http://localhost/cb',
    })

    await expect(provider.exchangeCode('code456')).rejects.toThrow('verified email')
    vi.unstubAllGlobals()
  })
})
