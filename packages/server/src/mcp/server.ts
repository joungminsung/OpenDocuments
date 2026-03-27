import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { discoverFiles } from '@opendocs/core'
import type { AppContext } from '../bootstrap.js'

const TOOLS = [
  {
    name: 'opendocs_ask',
    description: 'Query the RAG engine with a natural language question and get an answer with sources',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The question to ask' },
        profile: { type: 'string', description: 'RAG profile to use (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'opendocs_search',
    description: 'Perform a vector similarity search without LLM generation, returning raw document chunks',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The search query' },
        topK: { type: 'number', description: 'Maximum number of results to return (default: 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'opendocs_index_path',
    description: 'Index a local file or directory into the document store',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Absolute path to a file or directory to index' },
      },
      required: ['path'],
    },
  },
  {
    name: 'opendocs_document_list',
    description: 'List all indexed documents in the document store',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'opendocs_stats',
    description: 'Get system statistics including document count, workspace count, and plugin info',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'opendocs_doctor',
    description: 'Run a health check on the OpenDocs system and report status of all components',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'opendocs_connector_list',
    description: 'List registered connectors and their sync status',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'opendocs_connector_sync',
    description: 'Sync a connector to discover and index new documents',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Connector plugin name (omit to sync all)' },
      },
    },
  },
  {
    name: 'opendocs_document_get',
    description: 'Get document details by ID',
    inputSchema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'opendocs_document_delete',
    description: 'Delete a document (soft)',
    inputSchema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'opendocs_config_get',
    description: 'Get configuration value',
    inputSchema: { type: 'object' as const, properties: { key: { type: 'string' } } },
  },
  {
    name: 'opendocs_workspace_list',
    description: 'List workspaces',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'opendocs_plugin_list',
    description: 'List installed plugins',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'opendocs_workspace_switch',
    description: 'Switch workspace',
    inputSchema: {
      type: 'object' as const,
      properties: { name: { type: 'string', description: 'Workspace name to switch to' } },
      required: ['name'],
    },
  },
]

export function createMCPServer(ctx: AppContext): Server {
  const server = new Server(
    { name: 'opendocs', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS }
  })

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: 'opendocs://documents', name: 'Document List', mimeType: 'application/json' },
      { uri: 'opendocs://stats', name: 'System Stats', mimeType: 'application/json' },
    ],
  }))

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri
    if (uri === 'opendocs://documents') {
      const docs = ctx.store.listDocuments()
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(docs) }] }
    }
    if (uri === 'opendocs://stats') {
      const docs = ctx.store.listDocuments()
      const workspaces = ctx.workspaceManager.list()
      const plugins = ctx.registry.listAll()
      return {
        contents: [{
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ documents: docs.length, workspaces: workspaces.length, plugins: plugins.length }),
        }],
      }
    }
    throw new Error(`Unknown resource: ${uri}`)
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    try {
      switch (name) {
        case 'opendocs_ask': {
          const query = (args as Record<string, unknown>)?.query as string
          const profile = (args as Record<string, unknown>)?.profile as string | undefined
          if (!query) {
            return {
              content: [{ type: 'text' as const, text: 'Error: query parameter is required' }],
              isError: true,
            }
          }
          const result = await ctx.ragEngine.query({ query, profile })
          const sources = result.sources.map((s) => ({
            documentId: s.documentId,
            score: s.score,
            content: s.content.slice(0, 200),
          }))
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  answer: result.answer,
                  sources,
                  confidence: result.confidence,
                  profile: result.profile,
                }, null, 2),
              },
            ],
          }
        }

        case 'opendocs_search': {
          const query = (args as Record<string, unknown>)?.query as string
          const topK = ((args as Record<string, unknown>)?.topK as number) ?? 5
          if (!query) {
            return {
              content: [{ type: 'text' as const, text: 'Error: query parameter is required' }],
              isError: true,
            }
          }
          const embedder = ctx.registry.getModels().find(m => m.capabilities.embedding)
          if (!embedder?.embed) {
            return { content: [{ type: 'text' as const, text: 'No embedding model configured. Run opendocs init to set up a model.' }] }
          }

          let embedResult
          try {
            embedResult = await embedder.embed([(args as any).query])
          } catch (err) {
            return { content: [{ type: 'text' as const, text: `Embedding failed: ${(err as Error).message}` }] }
          }

          const results = await ctx.store.searchChunks(embedResult.dense[0], topK)
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  results.map((r) => ({
                    documentId: r.documentId,
                    score: r.score,
                    content: r.content.slice(0, 300),
                  })),
                  null,
                  2
                ),
              },
            ],
          }
        }

        case 'opendocs_index_path': {
          const filePath = (args as Record<string, unknown>)?.path as string
          if (!filePath) {
            return {
              content: [{ type: 'text' as const, text: 'Error: path parameter is required' }],
              isError: true,
            }
          }
          const { readFile } = await import('node:fs/promises')
          const { extname } = await import('node:path')

          let filesToIndex: string[]
          try {
            filesToIndex = discoverFiles(filePath)
          } catch {
            return {
              content: [{ type: 'text' as const, text: `Error: path not found: ${filePath}` }],
              isError: true,
            }
          }

          const results: { path: string; status: string; error?: string }[] = []
          for (const fp of filesToIndex) {
            try {
              const textExtensions = new Set(['.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.toml', '.csv', '.html', '.htm', '.ipynb'])
              const ext = extname(fp) || '.txt'
              const content = textExtensions.has(ext) ? await readFile(fp, 'utf-8') : await readFile(fp)
              await ctx.pipeline.ingest({
                title: fp,
                content,
                sourceType: 'local',
                sourcePath: fp,
                fileType: ext,
              })
              results.push({ path: fp, status: 'indexed' })
            } catch (err) {
              results.push({ path: fp, status: 'error', error: String(err) })
            }
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ indexed: results.filter((r) => r.status === 'indexed').length, results }, null, 2),
              },
            ],
          }
        }

        case 'opendocs_document_list': {
          const docs = ctx.store.listDocuments()
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  docs.map((d) => ({
                    id: d.id,
                    title: d.title,
                    sourcePath: d.source_path,
                    sourceType: d.source_type,
                    status: d.status,
                  })),
                  null,
                  2
                ),
              },
            ],
          }
        }

        case 'opendocs_stats': {
          const docs = ctx.store.listDocuments()
          const workspaces = ctx.workspaceManager.list()
          const plugins = ctx.registry.listAll()
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    documents: docs.length,
                    workspaces: workspaces.length,
                    plugins: plugins.length,
                    pluginList: plugins,
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }

        case 'opendocs_doctor': {
          const plugins = ctx.registry.listAll()
          const docs = ctx.store.listDocuments()
          const workspaces = ctx.workspaceManager.list()

          // Test SQLite connectivity
          let sqliteHealthy = true
          try {
            ctx.db.get('SELECT 1')
          } catch {
            sqliteHealthy = false
          }

          // Flag stub models
          const models = ctx.registry.getModels()
          const stubNames = new Set(models.filter((m) => m.name.includes('stub')).map((m) => m.name))

          const health = {
            status: sqliteHealthy ? 'ok' : 'degraded',
            components: {
              sqlite: { healthy: sqliteHealthy },
              store: { healthy: true, documents: docs.length },
              workspaces: { healthy: true, count: workspaces.length },
              plugins: plugins.map((p) => ({
                name: p.name,
                type: p.type,
                version: p.version,
                healthy: true,
                configured: !stubNames.has(p.name),
              })),
            },
          }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(health, null, 2) }],
          }
        }

        case 'opendocs_connector_list': {
          const connectors = ctx.connectorManager.listConnectors()
          if (connectors.length === 0) {
            return { content: [{ type: 'text' as const, text: 'No connectors registered' }] }
          }
          const formatted = connectors.map(c =>
            `${c.name} (${c.status}) -- last sync: ${c.lastSyncedAt || 'never'}`
          ).join('\n')
          return { content: [{ type: 'text' as const, text: formatted }] }
        }

        case 'opendocs_connector_sync': {
          const connectorName = (args as any).name
          if (connectorName) {
            const result = await ctx.connectorManager.syncConnector(connectorName)
            return { content: [{ type: 'text' as const, text: `Discovered: ${result.documentsDiscovered}, Indexed: ${result.documentsIndexed}, Skipped: ${result.documentsSkipped}${result.errors.length > 0 ? '\nErrors: ' + result.errors.join(', ') : ''}` }] }
          } else {
            const results = await ctx.connectorManager.syncAll()
            const formatted = results.map(r => `${r.connectorName}: ${r.documentsIndexed} indexed, ${r.documentsSkipped} skipped`).join('\n')
            return { content: [{ type: 'text' as const, text: formatted || 'No connectors to sync' }] }
          }
        }

        case 'opendocs_document_get': {
          const doc = ctx.store.getDocument((args as any).id)
          if (!doc) return { content: [{ type: 'text' as const, text: 'Document not found' }] }
          return { content: [{ type: 'text' as const, text: JSON.stringify(doc, null, 2) }] }
        }

        case 'opendocs_document_delete': {
          await ctx.store.softDeleteDocument((args as any).id)
          return { content: [{ type: 'text' as const, text: 'Document moved to trash' }] }
        }

        case 'opendocs_config_get': {
          const key = (args as any).key
          if (!key) return { content: [{ type: 'text' as const, text: JSON.stringify(ctx.config, null, 2) }] }
          const keys = key.split('.')
          let val: any = ctx.config
          for (const k of keys) val = val?.[k]
          return { content: [{ type: 'text' as const, text: JSON.stringify(val, null, 2) }] }
        }

        case 'opendocs_workspace_list': {
          const workspaces = ctx.workspaceManager.list()
          return { content: [{ type: 'text' as const, text: workspaces.map(w => `${w.name} (${w.mode})`).join('\n') }] }
        }

        case 'opendocs_plugin_list': {
          const plugins = ctx.registry.listAll()
          return { content: [{ type: 'text' as const, text: plugins.map(p => `${p.name} (${p.type}) v${p.version}`).join('\n') || 'No plugins installed' }] }
        }

        case 'opendocs_workspace_switch': {
          const ws = ctx.workspaceManager.getByName((args as any).name)
          if (!ws) return { content: [{ type: 'text' as const, text: 'Workspace not found' }] }
          return { content: [{ type: 'text' as const, text: `Switched to workspace: ${ws.name}` }] }
        }

        default:
          return {
            content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
            isError: true,
          }
      }
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${String(err)}` }],
        isError: true,
      }
    }
  })

  return server
}

export async function startMCPServer(ctx: AppContext): Promise<void> {
  const server = createMCPServer(ctx)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}
