import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SwaggerConnector } from '../src/index.js'

vi.mock('@opendocuments/core', async () => {
  const actual = await vi.importActual('@opendocuments/core')
  return { ...actual, fetchWithTimeout: vi.fn() }
})
import { fetchWithTimeout } from '@opendocuments/core'

const SAMPLE_SPEC = {
  openapi: '3.0.0',
  paths: {
    '/users': {
      get: { summary: 'List users', operationId: 'listUsers', responses: { '200': { description: 'OK' } } },
      post: { summary: 'Create user', operationId: 'createUser', requestBody: { content: {} } },
    },
    '/users/{id}': {
      get: { summary: 'Get user', operationId: 'getUser' },
    },
  },
}

describe('SwaggerConnector', () => {
  let connector: SwaggerConnector
  beforeEach(async () => {
    connector = new SwaggerConnector()
    await connector.setup({ config: { url: 'https://api.example.com/swagger.json' } as any, dataDir: '/tmp', log: console as any })
  })

  it('has correct metadata', () => {
    expect(connector.name).toBe('@opendocuments/connector-swagger')
    expect(connector.type).toBe('connector')
  })

  it('discovers API endpoints', async () => {
    ;(fetchWithTimeout as any).mockResolvedValue({ ok: true, json: async () => SAMPLE_SPEC })
    const docs: any[] = []
    for await (const d of connector.discover()) docs.push(d)
    expect(docs).toHaveLength(3)
    expect(docs[0].title).toBe('GET /users')
  })

  it('fetches endpoint documentation', async () => {
    ;(fetchWithTimeout as any).mockResolvedValue({ ok: true, json: async () => SAMPLE_SPEC })
    const raw = await connector.fetch({ sourceId: 'GET /users', sourcePath: 'swagger:///users#get' })
    expect(raw.content).toContain('List users')
  })

  it('healthCheck with valid URL', async () => {
    ;(fetchWithTimeout as any).mockResolvedValue({ ok: true })
    expect((await connector.healthCheck()).healthy).toBe(true)
  })
})
