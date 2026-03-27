import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createMCPServer } from '../../src/mcp/server.js'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

describe('MCP Server', () => {
  let tempDir: string
  let ctx: AppContext | null = null
  let mcpClient: Client | null = null
  let mcpServer: Server | null = null

  afterEach(async () => {
    if (mcpClient) {
      await mcpClient.close().catch(() => {})
      mcpClient = null
    }
    if (mcpServer) {
      await mcpServer.close().catch(() => {})
      mcpServer = null
    }
    if (ctx) {
      await ctx.shutdown()
      ctx = null
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  async function setupMCP() {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocs-mcp-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
    const server = createMCPServer(ctx)

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    const client = new Client({ name: 'test-client', version: '0.0.1' }, { capabilities: {} })
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    mcpClient = client
    mcpServer = server

    return { server, client, clientTransport, serverTransport }
  }

  it('lists 19 available tools', async () => {
    const { client } = await setupMCP()
    const result = await client.listTools()
    expect(result.tools).toHaveLength(19)
    const names = result.tools.map((t) => t.name)
    expect(names).toContain('opendocs_ask')
    expect(names).toContain('opendocs_search')
    expect(names).toContain('opendocs_index_path')
    expect(names).toContain('opendocs_document_list')
    expect(names).toContain('opendocs_stats')
    expect(names).toContain('opendocs_doctor')
    expect(names).toContain('opendocs_connector_list')
    expect(names).toContain('opendocs_connector_sync')
    expect(names).toContain('opendocs_document_get')
    expect(names).toContain('opendocs_document_delete')
    expect(names).toContain('opendocs_config_get')
    expect(names).toContain('opendocs_workspace_list')
  })

  it('opendocs_ask returns an answer', async () => {
    const { client } = await setupMCP()
    const result = await client.callTool({ name: 'opendocs_ask', arguments: { query: 'What is OpenDocs?' } })
    expect(result.content).toHaveLength(1)
    const text = (result.content[0] as { type: string; text: string }).text
    expect(text).toBeTruthy()
    const parsed = JSON.parse(text)
    expect(parsed).toHaveProperty('answer')
    expect(parsed).toHaveProperty('sources')
    expect(parsed).toHaveProperty('confidence')
  })

  it('opendocs_document_list returns empty list initially', async () => {
    const { client } = await setupMCP()
    const result = await client.callTool({ name: 'opendocs_document_list', arguments: {} })
    expect(result.content).toHaveLength(1)
    const text = (result.content[0] as { type: string; text: string }).text
    const docs = JSON.parse(text)
    expect(Array.isArray(docs)).toBe(true)
    expect(docs).toHaveLength(0)
  })

  it('opendocs_stats returns counts', async () => {
    const { client } = await setupMCP()
    const result = await client.callTool({ name: 'opendocs_stats', arguments: {} })
    expect(result.content).toHaveLength(1)
    const text = (result.content[0] as { type: string; text: string }).text
    const stats = JSON.parse(text)
    expect(stats).toHaveProperty('documents')
    expect(stats).toHaveProperty('workspaces')
    expect(stats).toHaveProperty('plugins')
    expect(typeof stats.documents).toBe('number')
    expect(typeof stats.workspaces).toBe('number')
    expect(typeof stats.plugins).toBe('number')
  })
})
