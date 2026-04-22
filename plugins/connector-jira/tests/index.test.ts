import { describe, it, expect, vi, beforeEach } from 'vitest'
import { JiraConnector } from '../src/index.js'

vi.mock('opendocuments-core', async () => {
  const actual = await vi.importActual('opendocuments-core')
  return { ...actual, fetchWithTimeout: vi.fn() }
})

import { fetchWithTimeout } from 'opendocuments-core'

const mockCtx = (overrides: Record<string, unknown> = {}) => ({
  config: {
    baseUrl: 'https://myorg.atlassian.net',
    email: 'user@example.com',
    apiToken: 'tok_abc',
    project: 'ENG',
    ...overrides,
  },
  dataDir: '/tmp',
  log: console as unknown as import('opendocuments-core').PluginContext['log'],
})

describe('JiraConnector', () => {
  let connector: JiraConnector

  beforeEach(async () => {
    vi.clearAllMocks()
    connector = new JiraConnector()
    await connector.setup(mockCtx())
  })

  it('has correct metadata', () => {
    expect(connector.name).toBe('@opendocuments/connector-jira')
    expect(connector.type).toBe('connector')
    expect(connector.version).toBe('0.1.1')
    expect(connector.coreVersion).toBe('^0.3.0')
  })

  it('healthCheck returns unhealthy without credentials', async () => {
    const empty = new JiraConnector()
    await empty.setup({ config: {}, dataDir: '/tmp', log: console as unknown as import('opendocuments-core').PluginContext['log'] })
    const status = await empty.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toMatch(/not configured/)
  })

  it('healthCheck returns healthy on success', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(true)
    expect(status.message).toContain('Connected')
  })

  it('healthCheck returns unhealthy on HTTP error', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 401 })
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('401')
  })

  it('uses Basic auth header', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true })
    await connector.healthCheck()
    const call = (fetchWithTimeout as ReturnType<typeof vi.fn>).mock.calls[0]
    const headers = (call[1] as { headers: Record<string, string> }).headers
    expect(headers['Authorization']).toMatch(/^Basic /)
    // Verify it encodes email:token correctly
    const decoded = Buffer.from(headers['Authorization'].slice('Basic '.length), 'base64').toString('utf-8')
    expect(decoded).toBe('user@example.com:tok_abc')
  })

  it('discovers issues with pagination', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 3,
          issues: [
            { id: '10001', key: 'ENG-1', fields: { summary: 'First issue', status: { name: 'Open' }, updated: '2026-01-01T00:00:00Z' } },
            { id: '10002', key: 'ENG-2', fields: { summary: 'Second issue', status: { name: 'In Progress' }, updated: '2026-01-02T00:00:00Z' } },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total: 3,
          issues: [
            { id: '10003', key: 'ENG-3', fields: { summary: 'Third issue', status: { name: 'Done' }, updated: '2026-01-03T00:00:00Z' } },
          ],
        }),
      })

    const docs: unknown[] = []
    for await (const doc of connector.discover()) docs.push(doc)

    expect(docs).toHaveLength(3)
    expect((docs[0] as { sourcePath: string }).sourcePath).toBe('jira://ENG-1')
    expect((docs[2] as { sourcePath: string }).sourcePath).toBe('jira://ENG-3')
  })

  it('includes project in JQL query', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ total: 0, issues: [] }),
    })
    const docs: unknown[] = []
    for await (const doc of connector.discover()) docs.push(doc)

    const call = (fetchWithTimeout as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = call[0] as string
    expect(url).toContain('project')
    expect(url).toContain('ENG')
  })

  it('includes statuses in JQL when configured', async () => {
    const statusConnector = new JiraConnector()
    await statusConnector.setup(mockCtx({ statuses: ['Open', 'In Progress'] }))

    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ total: 0, issues: [] }),
    })

    for await (const _ of statusConnector.discover()) { /* drain */ }

    const call = (fetchWithTimeout as ReturnType<typeof vi.fn>).mock.calls[0]
    const url = call[0] as string
    expect(url).toContain('status')
    expect(url).toContain('Open')
  })

  it('fetches issue and formats as markdown', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '10001',
        key: 'ENG-42',
        fields: {
          summary: 'Fix login bug',
          status: { name: 'In Review' },
          assignee: { displayName: 'Carol' },
          description: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Steps to reproduce the issue.' }],
              },
            ],
          },
          comment: {
            comments: [
              {
                id: 'c1',
                author: { displayName: 'Dave' },
                created: '2026-02-01T10:00:00Z',
                body: {
                  type: 'doc',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: 'Fixed in latest commit.' }],
                    },
                  ],
                },
              },
            ],
          },
          updated: '2026-02-01T10:00:00Z',
        },
      }),
    })

    const raw = await connector.fetch({ sourceId: '10001', sourcePath: 'jira://ENG-42' })
    expect(raw.title).toContain('ENG-42')
    expect(raw.content).toContain('# [ENG-42] Fix login bug')
    expect(raw.content).toContain('**Status:** In Review')
    expect(raw.content).toContain('**Assignee:** Carol')
    expect(raw.content).toContain('Steps to reproduce')
    expect(raw.content).toContain('## Comments')
    expect(raw.content).toContain('Dave')
    expect(raw.content).toContain('Fixed in latest commit.')
  })

  it('handles issue with no description or comments', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: '10002',
        key: 'ENG-99',
        fields: {
          summary: 'Minimal issue',
          status: { name: 'Open' },
          assignee: null,
          description: null,
          comment: { comments: [] },
          updated: '2026-01-01T00:00:00Z',
        },
      }),
    })

    const raw = await connector.fetch({ sourceId: '10002', sourcePath: 'jira://ENG-99' })
    expect(raw.content).toContain('# [ENG-99] Minimal issue')
    expect(raw.content).not.toContain('## Description')
    expect(raw.content).not.toContain('## Comments')
  })

  it('throws on fetch API error', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 404 })
    await expect(connector.fetch({ sourceId: '10001', sourcePath: 'jira://ENG-1' })).rejects.toThrow('404')
  })

  it('throws on discover API error', async () => {
    ;(fetchWithTimeout as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 403 })
    const gen = connector.discover()
    await expect(gen.next()).rejects.toThrow('403')
  })
})
