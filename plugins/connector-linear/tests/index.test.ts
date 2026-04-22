import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LinearConnector } from '../src/index.js'

vi.mock('opendocuments-core', async () => {
  const actual = await vi.importActual('opendocuments-core')
  return { ...actual, fetchWithTimeout: vi.fn() }
})

import { fetchWithTimeout } from 'opendocuments-core'

const mockCtx = (overrides: Record<string, unknown> = {}) => ({
  config: { apiKey: 'lin_api_testkey', teamId: 'team-1', ...overrides },
  dataDir: '/tmp',
  log: console as unknown as import('opendocuments-core').PluginContext['log'],
})

describe('LinearConnector', () => {
  let connector: LinearConnector

  beforeEach(async () => {
    vi.clearAllMocks()
    connector = new LinearConnector()
    await connector.setup(mockCtx())
  })

  it('has correct metadata', () => {
    expect(connector.name).toBe('@opendocuments/connector-linear')
    expect(connector.type).toBe('connector')
    expect(connector.version).toBe('0.1.1')
    expect(connector.coreVersion).toBe('^0.3.0')
  })

  it('healthCheck returns unhealthy without credentials', async () => {
    const empty = new LinearConnector()
    await empty.setup({ config: {}, dataDir: '/tmp', log: console as unknown as import('opendocuments-core').PluginContext['log'] })
    const status = await empty.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toMatch(/LINEAR_API_KEY/)
  })

  it('healthCheck returns healthy on success', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { viewer: { id: 'u1', name: 'Alice' } } }),
    })
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(true)
    expect(status.message).toContain('Alice')
  })

  it('healthCheck returns unhealthy when GraphQL errors present', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: 'Unauthorized' }] }),
    })
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(false)
  })

  it('healthCheck returns unhealthy on HTTP error', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401 })
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('401')
  })

  it('discovers issues with pagination', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
              nodes: [
                { id: 'id-1', identifier: 'ENG-1', title: 'First issue', updatedAt: '2026-01-01T00:00:00Z' },
              ],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              pageInfo: { hasNextPage: false, endCursor: undefined },
              nodes: [
                { id: 'id-2', identifier: 'ENG-2', title: 'Second issue', updatedAt: '2026-01-02T00:00:00Z' },
              ],
            },
          },
        }),
      })

    const docs: unknown[] = []
    for await (const doc of connector.discover()) docs.push(doc)

    expect(docs).toHaveLength(2)
    expect((docs[0] as { sourcePath: string }).sourcePath).toBe('linear://ENG-1')
    expect((docs[1] as { sourcePath: string }).sourcePath).toBe('linear://ENG-2')
  })

  it('uses cursor in second page request', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              pageInfo: { hasNextPage: true, endCursor: 'abc123' },
              nodes: [{ id: 'id-1', identifier: 'ENG-1', title: 'Issue 1', updatedAt: '2026-01-01T00:00:00Z' }],
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            issues: {
              pageInfo: { hasNextPage: false },
              nodes: [],
            },
          },
        }),
      })

    const docs: unknown[] = []
    for await (const doc of connector.discover()) docs.push(doc)

    const secondCall = (fetchWithTimeout as ReturnType<typeof vi.fn>).mock.calls[1]
    const body = JSON.parse((secondCall[1] as { body: string }).body) as { query: string }
    expect(body.query).toContain('abc123')
  })

  it('fetches issue and formats as markdown', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          issue: {
            id: 'id-1',
            identifier: 'ENG-1',
            title: 'Fix the bug',
            description: 'A detailed description',
            state: { name: 'In Progress' },
            assignee: { name: 'Bob' },
            comments: {
              nodes: [
                { id: 'c1', body: 'Looks good', user: { name: 'Alice' }, createdAt: '2026-01-05T12:00:00Z' },
              ],
            },
          },
        },
      }),
    })

    const raw = await connector.fetch({ sourceId: 'id-1', sourcePath: 'linear://ENG-1' })
    expect(raw.title).toContain('ENG-1')
    expect(raw.content).toContain('# [ENG-1] Fix the bug')
    expect(raw.content).toContain('**Status:** In Progress')
    expect(raw.content).toContain('**Assignee:** Bob')
    expect(raw.content).toContain('A detailed description')
    expect(raw.content).toContain('## Comments')
    expect(raw.content).toContain('Looks good')
    expect(raw.content).toContain('Alice')
  })

  it('throws on fetch API error', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 })
    await expect(connector.fetch({ sourceId: 'id-1', sourcePath: 'linear://ENG-1' })).rejects.toThrow('500')
  })

  it('throws on discover API error', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 403 })
    const gen = connector.discover()
    await expect(gen.next()).rejects.toThrow('403')
  })
})
