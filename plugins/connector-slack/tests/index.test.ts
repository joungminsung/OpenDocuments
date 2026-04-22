import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SlackConnector } from '../src/index.js'

describe('SlackConnector', () => {
  let connector: SlackConnector

  beforeEach(async () => {
    connector = new SlackConnector()
    await connector.setup({
      config: { token: 'xoxb-fake-token', channels: ['general'], maxMessages: 100 },
      dataDir: '/tmp',
      log: console as unknown as Parameters<typeof connector.setup>[0]['log'],
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has correct metadata', () => {
    expect(connector.name).toBe('@opendocuments/connector-slack')
    expect(connector.type).toBe('connector')
    expect(connector.version).toBe('0.1.1')
    expect(connector.coreVersion).toBe('^0.3.0')
  })

  it('reports unhealthy without token', async () => {
    const empty = new SlackConnector()
    await empty.setup({ config: {}, dataDir: '/tmp', log: console as unknown as Parameters<typeof connector.setup>[0]['log'] })
    const status = await empty.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('SLACK_BOT_TOKEN')
  })

  it('healthCheck succeeds when auth.test responds ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, team: 'MyWorkspace' }),
    }))
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(true)
    expect(status.message).toContain('MyWorkspace')
  })

  it('healthCheck fails when Slack returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'invalid_auth' }),
    }))
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('invalid_auth')
  })

  it('discovers threads grouped by thread_ts', async () => {
    const mockFetch = vi.fn()

    // First call: conversations.list
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        channels: [{ id: 'C001', name: 'general', is_archived: false, is_member: true }],
        response_metadata: { next_cursor: '' },
      }),
    })

    // Second call: conversations.history
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        messages: [
          { ts: '1000.0001', thread_ts: '1000.0001', user: 'U001', text: 'Root message' },
          { ts: '1000.0002', thread_ts: '1000.0001', user: 'U002', text: 'Reply to root' },
          { ts: '1001.0001', user: 'U001', text: 'Standalone message' },
        ],
        has_more: false,
      }),
    })

    vi.stubGlobal('fetch', mockFetch)

    const docs: unknown[] = []
    for await (const doc of connector.discover()) docs.push(doc)

    // Two threads: '1000.0001' (with reply) and '1001.0001' (standalone)
    expect(docs).toHaveLength(2)
    const paths = (docs as Array<{ sourcePath: string }>).map(d => d.sourcePath)
    expect(paths).toContain('slack://general/1000.0001')
    expect(paths).toContain('slack://general/1001.0001')
  })

  it('fetches thread messages and formats as [username]: text', async () => {
    const mockFetch = vi.fn()

    // First call: conversations.replies
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        messages: [
          { ts: '1000.0001', user: 'U001', text: 'Hello team!' },
          { ts: '1000.0002', user: 'U002', text: 'Hi there!' },
        ],
      }),
    })

    // users.info for U001
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, user: { real_name: 'Alice', name: 'alice' } }),
    })

    // users.info for U002
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, user: { real_name: 'Bob', name: 'bob' } }),
    })

    vi.stubGlobal('fetch', mockFetch)

    const raw = await connector.fetch({ sourceId: 'C001/1000.0001', sourcePath: 'slack://general/1000.0001' })
    expect(raw.content).toContain('[Alice]: Hello team!')
    expect(raw.content).toContain('[Bob]: Hi there!')
    expect(raw.title).toContain('general')
  })

  it('uses Bearer token in Authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, team: 'Test' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await connector.healthCheck()

    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[1].headers['Authorization']).toBe('Bearer xoxb-fake-token')
  })

  it('filters channels by configured list', async () => {
    const mockFetch = vi.fn()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        channels: [
          { id: 'C001', name: 'general', is_archived: false, is_member: true },
          { id: 'C002', name: 'random', is_archived: false, is_member: true },
        ],
        response_metadata: { next_cursor: '' },
      }),
    })

    // Only 'general' messages (channel filter in setup has channels: ['general'])
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        messages: [{ ts: '1000.0001', user: 'U001', text: 'Hello' }],
        has_more: false,
      }),
    })

    vi.stubGlobal('fetch', mockFetch)

    const docs: unknown[] = []
    for await (const doc of connector.discover()) docs.push(doc)

    // Only 'general' channel docs (not 'random') because connector was set up with channels: ['general']
    expect((docs as Array<{ sourcePath: string }>).every(d => d.sourcePath.startsWith('slack://general/'))).toBe(true)
    // conversations.history should only have been called once (for general, not random)
    const historyCalls = mockFetch.mock.calls.filter((c: unknown[]) =>
      typeof c[0] === 'string' && (c[0] as string).includes('conversations.history')
    )
    expect(historyCalls).toHaveLength(1)
  })
})
