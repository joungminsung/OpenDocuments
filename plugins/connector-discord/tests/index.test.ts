import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DiscordConnector } from '../src/index.js'

describe('DiscordConnector', () => {
  let connector: DiscordConnector

  beforeEach(async () => {
    connector = new DiscordConnector()
    await connector.setup({
      config: { token: 'fake-bot-token', guildId: 'guild-123' },
      dataDir: '/tmp',
      log: console as any,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has correct metadata', () => {
    expect(connector.name).toBe('@opendocuments/connector-discord')
    expect(connector.type).toBe('connector')
    expect(connector.version).toBe('0.1.0')
    expect(connector.coreVersion).toBe('^0.1.0')
  })

  it('healthCheck succeeds when bot token is valid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(true)
  })

  it('healthCheck fails when token is not set', async () => {
    const empty = new DiscordConnector()
    await empty.setup({ config: {}, dataDir: '/tmp', log: console as any })
    const status = await empty.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('DISCORD_BOT_TOKEN')
  })

  it('healthCheck fails when API returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('401')
  })

  it('uses Bot auth header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    await connector.healthCheck()
    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[1].headers.Authorization).toBe('Bot fake-bot-token')
  })

  it('discovers text channels and groups messages by day', async () => {
    const mockChannels: unknown[] = [
      { id: 'ch-1', name: 'general', type: 0 },
      { id: 'ch-2', name: 'voice', type: 2 },
    ]
    const mockMessages: unknown[] = [
      { id: 'msg-1', content: 'Hello!', timestamp: '2024-01-15T10:00:00.000Z', author: { username: 'alice' } },
      { id: 'msg-2', content: 'World!', timestamp: '2024-01-15T11:00:00.000Z', author: { username: 'bob' } },
      { id: 'msg-3', content: 'Next day', timestamp: '2024-01-16T09:00:00.000Z', author: { username: 'alice' } },
    ]

    let callCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      callCount++
      if (url.includes('/guilds/')) {
        return Promise.resolve({ ok: true, json: async () => mockChannels })
      }
      if (callCount === 2) {
        return Promise.resolve({ ok: true, json: async () => mockMessages })
      }
      return Promise.resolve({ ok: true, json: async () => [] })
    }))

    const docs: unknown[] = []
    for await (const doc of connector.discover()) docs.push(doc)

    // Should yield 2 day-batches for general channel (voice channel skipped)
    expect(docs).toHaveLength(2)
    const paths = (docs as Array<{ sourcePath: string }>).map(d => d.sourcePath)
    expect(paths).toContain('discord://general/2024-01-15')
    expect(paths).toContain('discord://general/2024-01-16')
  })

  it('fetch formats messages as [username]: content', async () => {
    const mockMessages: unknown[] = [
      { id: 'msg-2', content: 'World!', timestamp: '2024-01-15T11:00:00.000Z', author: { username: 'bob' } },
      { id: 'msg-1', content: 'Hello!', timestamp: '2024-01-15T10:00:00.000Z', author: { username: 'alice' } },
    ]

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockMessages })
      .mockResolvedValueOnce({ ok: true, json: async () => [] }),
    )

    const raw = await connector.fetch({
      sourceId: 'ch-1/2024-01-15',
      sourcePath: 'discord://general/2024-01-15',
    })

    expect(raw.content).toContain('[alice]: Hello!')
    expect(raw.content).toContain('[bob]: World!')
    // alice's message comes first (chronological order)
    const aliceIdx = raw.content.indexOf('[alice]')
    const bobIdx = raw.content.indexOf('[bob]')
    expect(aliceIdx).toBeLessThan(bobIdx)
  })

  it('skips empty messages when grouping by day', async () => {
    const mockMessages: unknown[] = [
      { id: 'msg-1', content: '', timestamp: '2024-01-15T10:00:00.000Z', author: { username: 'alice' } },
      { id: 'msg-2', content: '   ', timestamp: '2024-01-15T11:00:00.000Z', author: { username: 'bob' } },
      { id: 'msg-3', content: 'Real message', timestamp: '2024-01-15T12:00:00.000Z', author: { username: 'carol' } },
    ]

    const mockChannels: unknown[] = [{ id: 'ch-1', name: 'general', type: 0 }]

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => mockChannels })
      .mockResolvedValueOnce({ ok: true, json: async () => mockMessages })
      .mockResolvedValueOnce({ ok: true, json: async () => [] }),
    )

    const docs: unknown[] = []
    for await (const doc of connector.discover()) docs.push(doc)

    // Only 1 day batch since empty messages are filtered out but real one exists
    expect(docs).toHaveLength(1)
  })
})
