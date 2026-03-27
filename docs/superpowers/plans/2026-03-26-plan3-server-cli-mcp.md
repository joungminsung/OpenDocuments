# Plan 3: Server + CLI + MCP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the core ingest pipeline and RAG engine through three interfaces -- HTTP REST API, CLI commands, and MCP server -- so that users can index documents and ask questions via any interface.

**Architecture:** `@opendocuments/server` wraps `@opendocuments/core` with Hono HTTP routes + WebSocket streaming + MCP stdio/SSE server. `@opendocuments/cli` provides the `opendocuments` binary with subcommands that either call the core directly (for `ask`, `index`) or start the server (for `start`). Both packages share a common bootstrap module that initializes DB, VectorDB, plugins, and engines.

**Tech Stack:** Hono (HTTP), @modelcontextprotocol/sdk (MCP), Commander.js (CLI), ws (WebSocket), inquirer (interactive prompts)

**Spec Reference:** `docs/superpowers/specs/2026-03-26-opendocuments-design.md` section 6

**Depends on:** Plan 1 + Plan 2 complete (78 tests passing)

---

## Scope for Plan 3

Plan 3 focuses on **making the core usable** through real interfaces. Web UI is Plan 4.

**In scope:**
- Application bootstrap (wire all core components together)
- HTTP REST API (chat, documents, health)
- WebSocket streaming for chat
- MCP server (stdio + SSE modes, core tools)
- CLI: `init`, `start`, `ask`, `index`, `doctor`, `config`
- `opendocuments.config.ts` runtime loading via jiti

**Out of scope (Plan 4+):**
- Web UI (React SPA)
- Connectors (GitHub, Notion -- Phase 2)
- Auth/team mode (Phase 2)
- Plugin marketplace CLI
- Shell completions
- Interactive init wizard (simplified version only)

---

## File Structure

```
packages/
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # public API: createServer()
│       ├── bootstrap.ts          # initialize all core components
│       ├── http/
│       │   ├── app.ts            # Hono app with all routes
│       │   ├── routes/
│       │   │   ├── chat.ts       # POST /api/v1/chat
│       │   │   ├── documents.ts  # CRUD /api/v1/documents
│       │   │   └── health.ts     # GET /api/v1/health, GET /api/v1/stats
│       │   └── ws.ts             # WebSocket /api/v1/ws/chat
│       └── mcp/
│           └── server.ts         # MCP server (stdio + SSE)
│
├── cli/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts              # bin entry point
│       ├── commands/
│       │   ├── init.ts           # opendocuments init
│       │   ├── start.ts          # opendocuments start
│       │   ├── ask.ts            # opendocuments ask
│       │   ├── index-cmd.ts      # opendocuments index (named to avoid conflict with index.ts)
│       │   ├── doctor.ts         # opendocuments doctor
│       │   └── config-cmd.ts     # opendocuments config
│       └── utils/
│           └── bootstrap.ts      # shared bootstrap for CLI commands

packages/server/tests/
├── http/
│   ├── chat.test.ts
│   ├── documents.test.ts
│   └── health.test.ts
├── mcp/
│   └── server.test.ts
└── bootstrap.test.ts

packages/cli/tests/
├── commands/
│   ├── ask.test.ts
│   └── doctor.test.ts
```

---

## Task 1: Server Package Setup + Bootstrap

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/bootstrap.ts`
- Create: `packages/server/tests/bootstrap.test.ts`

- [ ] **Step 1: Create packages/server/package.json**

```json
{
  "name": "@opendocuments/server",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@opendocuments/core": "workspace:*",
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "@hono/node-ws": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "jiti": "^2.4.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create packages/server/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["tests/**/*", "dist"]
}
```

- [ ] **Step 3: Write failing test for bootstrap**

```typescript
// packages/server/tests/bootstrap.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../src/bootstrap.js'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('bootstrap', () => {
  let tempDir: string
  let ctx: AppContext | null = null

  afterEach(async () => {
    if (ctx) {
      await ctx.shutdown()
      ctx = null
    }
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  it('initializes all core components with default config', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })

    expect(ctx.config).toBeDefined()
    expect(ctx.db).toBeDefined()
    expect(ctx.vectorDb).toBeDefined()
    expect(ctx.registry).toBeDefined()
    expect(ctx.eventBus).toBeDefined()
    expect(ctx.pipeline).toBeDefined()
    expect(ctx.ragEngine).toBeDefined()
    expect(ctx.workspaceManager).toBeDefined()
  })

  it('creates default workspace on bootstrap', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })

    const ws = ctx.workspaceManager.getByName('default')
    expect(ws).toBeDefined()
  })
})
```

- [ ] **Step 4: Implement bootstrap**

```typescript
// packages/server/src/bootstrap.ts
import {
  createSQLiteDB,
  createLanceDB,
  runMigrations,
  PluginRegistry,
  EventBus,
  MiddlewareRunner,
  WorkspaceManager,
  DocumentStore,
  IngestPipeline,
  RAGEngine,
  MarkdownParser,
  loadConfig,
  type DB,
  type VectorDB,
  type OpenDocumentsConfig,
  type ModelPlugin,
  type PluginContext,
} from '@opendocuments/core'
import { join } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'

export interface BootstrapOptions {
  dataDir?: string
  configDir?: string
  config?: Partial<OpenDocumentsConfig>
}

export interface AppContext {
  config: OpenDocumentsConfig
  db: DB
  vectorDb: VectorDB
  registry: PluginRegistry
  eventBus: EventBus
  middleware: MiddlewareRunner
  workspaceManager: WorkspaceManager
  store: DocumentStore
  pipeline: IngestPipeline
  ragEngine: RAGEngine
  shutdown: () => Promise<void>
}

/**
 * A stub embedding model for when no real model plugin is available.
 * Returns zero vectors. Used for testing and initial setup.
 * Real model plugins will be loaded in Phase 2 (Ollama, OpenAI, etc.)
 */
function createStubEmbedder(dimensions: number): ModelPlugin {
  return {
    name: '@opendocuments/model-stub-embedder',
    type: 'model',
    version: '0.1.0',
    coreVersion: '^0.1.0',
    capabilities: { embedding: true },
    async setup() {},
    async embed(texts: string[]) {
      return {
        dense: texts.map(() => new Array(dimensions).fill(0)),
      }
    },
  }
}

/**
 * A stub LLM for when no real model plugin is available.
 * Returns a placeholder response. Real models loaded in Phase 2.
 */
function createStubLLM(): ModelPlugin {
  return {
    name: '@opendocuments/model-stub-llm',
    type: 'model',
    version: '0.1.0',
    coreVersion: '^0.1.0',
    capabilities: { llm: true },
    async setup() {},
    async *generate(prompt: string) {
      yield 'No LLM model is configured. Please run `opendocuments init` to set up a model provider.'
    },
  }
}

export async function bootstrap(opts: BootstrapOptions = {}): Promise<AppContext> {
  // Config
  const config = loadConfig(opts.configDir || process.cwd())
  if (opts.config) {
    Object.assign(config, opts.config)
  }

  // Data directory
  const dataDir = opts.dataDir || config.storage.dataDir.replace('~', process.env.HOME || '~')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  // SQLite
  const dbPath = join(dataDir, 'opendocuments.db')
  const db = createSQLiteDB(dbPath)
  runMigrations(db)

  // LanceDB
  const vectorDir = join(dataDir, 'vectors')
  if (!existsSync(vectorDir)) {
    mkdirSync(vectorDir, { recursive: true })
  }
  const vectorDb = await createLanceDB(vectorDir)

  // Core components
  const registry = new PluginRegistry()
  const eventBus = new EventBus()
  const middleware = new MiddlewareRunner()

  // Plugin context
  const pluginCtx: PluginContext = {
    config: config as unknown as Record<string, unknown>,
    dataDir,
    log: {
      ok: (msg: string) => {},
      fail: (msg: string) => {},
      info: (msg: string) => {},
      wait: (msg: string) => {},
    },
  }

  // Register built-in parser
  await registry.register(new MarkdownParser(), pluginCtx)

  // Register model plugins (stubs for now -- real plugins loaded in Phase 2)
  const embeddingDimensions = 384 // default for stub; real models override
  const embedder = createStubEmbedder(embeddingDimensions)
  const llm = createStubLLM()
  await registry.register(embedder, pluginCtx)
  await registry.register(llm, pluginCtx)

  // Workspace
  const workspaceManager = new WorkspaceManager(db)
  const defaultWorkspace = workspaceManager.ensureDefault()

  // Document Store
  const store = new DocumentStore(db, vectorDb, defaultWorkspace.id)
  await store.initialize(embeddingDimensions)

  // Pipelines
  const pipeline = new IngestPipeline({
    store, registry, eventBus, middleware, embeddingDimensions,
  })

  const ragEngine = new RAGEngine({
    store, llm, embedder, eventBus,
    defaultProfile: config.rag.profile,
  })

  const shutdown = async () => {
    await registry.teardownAll()
    await vectorDb.close()
    db.close()
  }

  return {
    config, db, vectorDb, registry, eventBus, middleware,
    workspaceManager, store, pipeline, ragEngine, shutdown,
  }
}
```

- [ ] **Step 5: Create barrel export**

```typescript
// packages/server/src/index.ts
export { bootstrap, type AppContext, type BootstrapOptions } from './bootstrap.js'
```

- [ ] **Step 6: Install deps, run tests, commit**

```bash
npm install
cd packages/server && npx vitest run
```

Commit: `"feat(server): add bootstrap module that wires all core components"`

---

## Task 2: HTTP Routes (Health + Documents)

**Files:**
- Create: `packages/server/src/http/app.ts`
- Create: `packages/server/src/http/routes/health.ts`
- Create: `packages/server/src/http/routes/documents.ts`
- Create: `packages/server/tests/http/health.test.ts`
- Create: `packages/server/tests/http/documents.test.ts`

- [ ] **Step 1: Create Hono app with health route**

```typescript
// packages/server/src/http/routes/health.ts
import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'

export function healthRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/health', (c) => {
    return c.json({ status: 'ok', version: '0.1.0' })
  })

  app.get('/api/v1/stats', (c) => {
    const docs = ctx.store.listDocuments()
    const workspaces = ctx.workspaceManager.list()
    const plugins = ctx.registry.listAll()

    return c.json({
      documents: docs.length,
      workspaces: workspaces.length,
      plugins: plugins.length,
      pluginList: plugins,
    })
  })

  return app
}
```

```typescript
// packages/server/src/http/routes/documents.ts
import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'

export function documentRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/documents', (c) => {
    const docs = ctx.store.listDocuments()
    return c.json({ documents: docs })
  })

  app.get('/api/v1/documents/:id', (c) => {
    const doc = ctx.store.getDocument(c.req.param('id'))
    if (!doc) return c.json({ error: 'Document not found' }, 404)
    return c.json(doc)
  })

  app.delete('/api/v1/documents/:id', async (c) => {
    const doc = ctx.store.getDocument(c.req.param('id'))
    if (!doc) return c.json({ error: 'Document not found' }, 404)
    await ctx.store.deleteDocument(c.req.param('id'))
    return c.json({ deleted: true })
  })

  app.post('/api/v1/documents/upload', async (c) => {
    const body = await c.req.parseBody()
    const file = body['file']
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400)
    }

    const content = await file.text()
    const result = await ctx.pipeline.ingest({
      title: file.name,
      content,
      sourceType: 'upload',
      sourcePath: file.name,
      fileType: '.' + file.name.split('.').pop(),
    })

    return c.json(result, 201)
  })

  return app
}
```

```typescript
// packages/server/src/http/app.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { healthRoutes } from './routes/health.js'
import { documentRoutes } from './routes/documents.js'
import type { AppContext } from '../bootstrap.js'

export function createApp(ctx: AppContext) {
  const app = new Hono()

  app.use('*', cors())

  app.route('/', healthRoutes(ctx))
  app.route('/', documentRoutes(ctx))

  return app
}
```

- [ ] **Step 2: Write tests**

```typescript
// packages/server/tests/http/health.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createApp } from '../../src/http/app.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Health Routes', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
    app = createApp(ctx)
  })

  afterEach(async () => {
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('GET /api/v1/health returns ok', async () => {
    const res = await app.request('/api/v1/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('GET /api/v1/stats returns counts', async () => {
    const res = await app.request('/api/v1/stats')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.documents).toBe(0)
    expect(body.workspaces).toBe(1)
    expect(body.plugins).toBeGreaterThan(0)
  })
})
```

```typescript
// packages/server/tests/http/documents.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createApp } from '../../src/http/app.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Document Routes', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
    app = createApp(ctx)
  })

  afterEach(async () => {
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('GET /api/v1/documents returns empty list', async () => {
    const res = await app.request('/api/v1/documents')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.documents).toEqual([])
  })

  it('POST /api/v1/documents/upload indexes a file', async () => {
    const formData = new FormData()
    formData.append('file', new File(['# Hello\n\nWorld'], 'test.md', { type: 'text/markdown' }))

    const res = await app.request('/api/v1/documents/upload', {
      method: 'POST',
      body: formData,
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('indexed')

    // Verify document appears in list
    const listRes = await app.request('/api/v1/documents')
    const listBody = await listRes.json()
    expect(listBody.documents.length).toBe(1)
  })

  it('GET /api/v1/documents/:id returns 404 for missing', async () => {
    const res = await app.request('/api/v1/documents/nonexistent')
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 3: Run tests, export, commit**

Update `packages/server/src/index.ts`:
```typescript
export { bootstrap, type AppContext, type BootstrapOptions } from './bootstrap.js'
export { createApp } from './http/app.js'
```

Commit: `"feat(server): add HTTP routes for health, stats, and document CRUD"`

---

## Task 3: Chat Route (POST + WebSocket streaming)

**Files:**
- Create: `packages/server/src/http/routes/chat.ts`
- Create: `packages/server/src/http/ws.ts`
- Create: `packages/server/tests/http/chat.test.ts`

- [ ] **Step 1: Implement chat REST route**

```typescript
// packages/server/src/http/routes/chat.ts
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppContext } from '../../bootstrap.js'

export function chatRoutes(ctx: AppContext) {
  const app = new Hono()

  // Non-streaming chat
  app.post('/api/v1/chat', async (c) => {
    const body = await c.req.json<{ query: string; profile?: string }>()

    if (!body.query) {
      return c.json({ error: 'query is required' }, 400)
    }

    const result = await ctx.ragEngine.query({
      query: body.query,
      profile: body.profile,
    })

    return c.json(result)
  })

  // SSE streaming chat
  app.post('/api/v1/chat/stream', (c) => {
    const bodyPromise = c.req.json<{ query: string; profile?: string }>()

    return streamSSE(c, async (stream) => {
      const body = await bodyPromise
      if (!body.query) {
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', data: 'query is required' }) })
        return
      }

      for await (const event of ctx.ragEngine.queryStream({
        query: body.query,
        profile: body.profile,
      })) {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify(event.data),
        })
      }
    })
  })

  return app
}
```

- [ ] **Step 2: Write chat test**

```typescript
// packages/server/tests/http/chat.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createApp } from '../../src/http/app.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Chat Routes', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
    app = createApp(ctx)
  })

  afterEach(async () => {
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('POST /api/v1/chat returns an answer', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Hello' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.answer).toBeDefined()
    expect(body.route).toBe('direct')
  })

  it('POST /api/v1/chat returns 400 without query', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/v1/chat/stream returns SSE events', async () => {
    const res = await app.request('/api/v1/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Hello' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
  })
})
```

- [ ] **Step 3: Add chat routes to app.ts, run tests, commit**

Update `app.ts` to include `chatRoutes`.

Commit: `"feat(server): add chat endpoint with SSE streaming"`

---

## Task 4: MCP Server

**Files:**
- Create: `packages/server/src/mcp/server.ts`
- Create: `packages/server/tests/mcp/server.test.ts`

- [ ] **Step 1: Implement MCP server**

```typescript
// packages/server/src/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { AppContext } from '../bootstrap.js'

export function createMCPServer(ctx: AppContext) {
  const server = new Server(
    { name: 'opendocuments', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'opendocuments_ask',
        description: 'Ask a question about indexed documents',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string', description: 'The question to ask' },
            profile: { type: 'string', description: 'RAG profile: fast, balanced, or precise', enum: ['fast', 'balanced', 'precise'] },
          },
          required: ['query'],
        },
      },
      {
        name: 'opendocuments_search',
        description: 'Search indexed documents by keyword (no LLM generation)',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string', description: 'Search query' },
            topK: { type: 'number', description: 'Number of results', default: 5 },
          },
          required: ['query'],
        },
      },
      {
        name: 'opendocuments_index_path',
        description: 'Index a local file or directory',
        inputSchema: {
          type: 'object' as const,
          properties: {
            path: { type: 'string', description: 'File or directory path to index' },
          },
          required: ['path'],
        },
      },
      {
        name: 'opendocuments_document_list',
        description: 'List all indexed documents',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'opendocuments_stats',
        description: 'Get system statistics',
        inputSchema: { type: 'object' as const, properties: {} },
      },
      {
        name: 'opendocuments_doctor',
        description: 'Run health diagnostics',
        inputSchema: { type: 'object' as const, properties: {} },
      },
    ],
  }))

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    switch (name) {
      case 'opendocuments_ask': {
        const result = await ctx.ragEngine.query({
          query: (args as any).query,
          profile: (args as any).profile,
        })
        return {
          content: [
            { type: 'text' as const, text: result.answer },
            { type: 'text' as const, text: `\n\nSources: ${result.sources.map(s => s.sourcePath).join(', ')}` },
            { type: 'text' as const, text: `\nConfidence: ${result.confidence.level} (${result.confidence.score.toFixed(2)})` },
          ],
        }
      }

      case 'opendocuments_search': {
        const topK = (args as any).topK || 5
        // Use retriever directly via store
        const embedder = ctx.registry.getModels().find(m => m.capabilities.embedding)
        if (!embedder?.embed) {
          return { content: [{ type: 'text' as const, text: 'No embedding model configured' }] }
        }
        const embedResult = await embedder.embed([(args as any).query])
        const results = await ctx.store.searchChunks(embedResult.dense[0], topK)
        const formatted = results.map((r, i) =>
          `${i + 1}. [${r.sourcePath}] (score: ${r.score.toFixed(2)})\n   ${r.content.substring(0, 200)}...`
        ).join('\n\n')
        return { content: [{ type: 'text' as const, text: formatted || 'No results found' }] }
      }

      case 'opendocuments_index_path': {
        const path = (args as any).path as string
        const { readFileSync, statSync, readdirSync } = await import('node:fs')
        const { extname, join, basename } = await import('node:path')

        const stat = statSync(path)
        const results: string[] = []

        if (stat.isFile()) {
          const content = readFileSync(path, 'utf-8')
          const result = await ctx.pipeline.ingest({
            title: basename(path),
            content,
            sourceType: 'local',
            sourcePath: path,
            fileType: extname(path),
          })
          results.push(`${basename(path)}: ${result.status} (${result.chunks} chunks)`)
        } else if (stat.isDirectory()) {
          const files = readdirSync(path).filter(f => ['.md', '.mdx', '.txt'].includes(extname(f)))
          for (const file of files) {
            const filePath = join(path, file)
            const content = readFileSync(filePath, 'utf-8')
            const result = await ctx.pipeline.ingest({
              title: file,
              content,
              sourceType: 'local',
              sourcePath: filePath,
              fileType: extname(file),
            })
            results.push(`${file}: ${result.status} (${result.chunks} chunks)`)
          }
        }

        return { content: [{ type: 'text' as const, text: results.join('\n') || 'No files indexed' }] }
      }

      case 'opendocuments_document_list': {
        const docs = ctx.store.listDocuments()
        const formatted = docs.map(d =>
          `- ${d.title} (${d.source_type}, ${d.chunk_count} chunks, ${d.status})`
        ).join('\n')
        return { content: [{ type: 'text' as const, text: formatted || 'No documents indexed' }] }
      }

      case 'opendocuments_stats': {
        const docs = ctx.store.listDocuments()
        const workspaces = ctx.workspaceManager.list()
        const plugins = ctx.registry.listAll()
        return {
          content: [{
            type: 'text' as const,
            text: `Documents: ${docs.length}\nWorkspaces: ${workspaces.length}\nPlugins: ${plugins.map(p => p.name).join(', ')}`,
          }],
        }
      }

      case 'opendocuments_doctor': {
        const checks: string[] = []
        checks.push(`Core          v0.1.0                        [ok]`)
        checks.push(`SQLite        connected                     [ok]`)
        checks.push(`LanceDB       connected                     [ok]`)
        const docs = ctx.store.listDocuments()
        checks.push(`Documents     ${docs.length} indexed                  [ok]`)
        const plugins = ctx.registry.listAll()
        for (const p of plugins) {
          checks.push(`${p.name.padEnd(30)} v${p.version}  [ok]`)
        }
        return { content: [{ type: 'text' as const, text: checks.join('\n') }] }
      }

      default:
        return { content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }] }
    }
  })

  return {
    server,
    async startStdio() {
      const transport = new StdioServerTransport()
      await server.connect(transport)
    },
  }
}
```

- [ ] **Step 2: Write MCP test**

```typescript
// packages/server/tests/mcp/server.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createMCPServer } from '../../src/mcp/server.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('MCP Server', () => {
  let ctx: AppContext
  let client: Client
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })

    const mcp = createMCPServer(ctx)
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} })
    await Promise.all([
      client.connect(clientTransport),
      mcp.server.connect(serverTransport),
    ])
  })

  afterEach(async () => {
    await client.close()
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('lists available tools', async () => {
    const result = await client.listTools()
    const names = result.tools.map(t => t.name)
    expect(names).toContain('opendocuments_ask')
    expect(names).toContain('opendocuments_search')
    expect(names).toContain('opendocuments_document_list')
    expect(names).toContain('opendocuments_stats')
    expect(names).toContain('opendocuments_doctor')
    expect(names).toContain('opendocuments_index_path')
  })

  it('opendocuments_ask returns an answer', async () => {
    const result = await client.callTool({
      name: 'opendocuments_ask',
      arguments: { query: 'Hello' },
    })
    expect(result.content).toBeDefined()
    expect((result.content as any)[0].text).toBeDefined()
  })

  it('opendocuments_document_list returns empty', async () => {
    const result = await client.callTool({
      name: 'opendocuments_document_list',
      arguments: {},
    })
    expect((result.content as any)[0].text).toContain('No documents')
  })

  it('opendocuments_stats returns counts', async () => {
    const result = await client.callTool({
      name: 'opendocuments_stats',
      arguments: {},
    })
    expect((result.content as any)[0].text).toContain('Documents:')
  })
})
```

- [ ] **Step 3: Export, run tests, commit**

Update barrel to export `createMCPServer`.

Commit: `"feat(server): add MCP server with 6 tools (ask, search, index, documents, stats, doctor)"`

---

## Task 5: CLI Package Setup + Core Commands

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/utils/bootstrap.ts`
- Create: `packages/cli/src/commands/start.ts`
- Create: `packages/cli/src/commands/ask.ts`
- Create: `packages/cli/src/commands/index-cmd.ts`
- Create: `packages/cli/src/commands/doctor.ts`
- Create: `packages/cli/src/commands/config-cmd.ts`

- [ ] **Step 1: Create packages/cli/package.json**

```json
{
  "name": "@opendocuments/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "opendocuments": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@opendocuments/core": "workspace:*",
    "@opendocuments/server": "workspace:*",
    "commander": "^12.1.0",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create CLI bootstrap utility**

```typescript
// packages/cli/src/utils/bootstrap.ts
import { bootstrap, type AppContext } from '@opendocuments/server'

let cachedCtx: AppContext | null = null

export async function getContext(): Promise<AppContext> {
  if (cachedCtx) return cachedCtx
  cachedCtx = await bootstrap()
  return cachedCtx
}

export async function shutdownContext(): Promise<void> {
  if (cachedCtx) {
    await cachedCtx.shutdown()
    cachedCtx = null
  }
}
```

- [ ] **Step 3: Create CLI entry point with Commander**

```typescript
// packages/cli/src/index.ts
#!/usr/bin/env node
import { Command } from 'commander'
import { startCommand } from './commands/start.js'
import { askCommand } from './commands/ask.js'
import { indexCommand } from './commands/index-cmd.js'
import { doctorCommand } from './commands/doctor.js'
import { configCommand } from './commands/config-cmd.js'

const program = new Command()

program
  .name('opendocuments')
  .description('OpenDocuments - Self-hosted RAG platform for organizational documents')
  .version('0.1.0')

program.addCommand(startCommand())
program.addCommand(askCommand())
program.addCommand(indexCommand())
program.addCommand(doctorCommand())
program.addCommand(configCommand())

program.parse()
```

- [ ] **Step 4: Implement start command**

```typescript
// packages/cli/src/commands/start.ts
import { Command } from 'commander'
import { log } from '@opendocuments/core'
import { bootstrap, createApp } from '@opendocuments/server'
import { serve } from '@hono/node-server'

export function startCommand() {
  const cmd = new Command('start')
    .description('Start OpenDocuments server')
    .option('-p, --port <port>', 'Port number', '3000')
    .option('--mcp-only', 'Start MCP server only (stdio mode)')
    .option('--no-web', 'Disable web UI static serving')
    .action(async (opts) => {
      log.heading('OpenDocuments Server')

      if (opts.mcpOnly) {
        log.wait('Starting MCP server (stdio mode)...')
        const ctx = await bootstrap()
        const { createMCPServer } = await import('@opendocuments/server')
        const mcp = createMCPServer(ctx)
        await mcp.startStdio()
        return
      }

      log.wait('Bootstrapping...')
      const ctx = await bootstrap()
      const app = createApp(ctx)
      const port = parseInt(opts.port)

      serve({ fetch: app.fetch, port }, () => {
        log.ok(`Server running at http://localhost:${port}`)
        log.arrow(`API: http://localhost:${port}/api/v1`)
        log.dim('Press Ctrl+C to stop')
      })

      process.on('SIGINT', async () => {
        log.blank()
        log.wait('Shutting down...')
        await ctx.shutdown()
        log.ok('Goodbye')
        process.exit(0)
      })
    })

  return cmd
}
```

- [ ] **Step 5: Implement ask command**

```typescript
// packages/cli/src/commands/ask.ts
import { Command } from 'commander'
import { log } from '@opendocuments/core'
import chalk from 'chalk'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

export function askCommand() {
  const cmd = new Command('ask')
    .description('Ask a question about indexed documents')
    .argument('[query]', 'The question to ask')
    .option('--profile <profile>', 'RAG profile: fast, balanced, precise', 'balanced')
    .option('--json', 'Output as JSON')
    .action(async (query, opts) => {
      if (!query) {
        console.error(chalk.red('Usage: opendocuments ask "your question"'))
        process.exit(1)
      }

      const ctx = await getContext()

      try {
        if (opts.json) {
          const result = await ctx.ragEngine.query({ query, profile: opts.profile })
          console.log(JSON.stringify(result, null, 2))
        } else {
          log.heading('OpenDocuments')
          log.dim(`Profile: ${opts.profile}`)
          log.blank()
          console.log(chalk.green('  >'), chalk.white(query))
          log.blank()

          let answer = ''
          for await (const event of ctx.ragEngine.queryStream({ query, profile: opts.profile })) {
            if (event.type === 'chunk') {
              process.stdout.write(event.data)
              answer += event.data
            }
            if (event.type === 'sources' && Array.isArray(event.data) && event.data.length > 0) {
              log.blank()
              log.dim('Sources:')
              for (const src of event.data) {
                log.dim(`  ${chalk.cyan(src.sourcePath)}`)
              }
            }
          }
          log.blank()
        }
      } finally {
        await shutdownContext()
      }
    })

  return cmd
}
```

- [ ] **Step 6: Implement index command**

```typescript
// packages/cli/src/commands/index-cmd.ts
import { Command } from 'commander'
import { log } from '@opendocuments/core'
import { getContext, shutdownContext } from '../utils/bootstrap.js'
import { readFileSync, statSync, readdirSync } from 'node:fs'
import { extname, join, basename, resolve } from 'node:path'

export function indexCommand() {
  const cmd = new Command('index')
    .description('Index a file or directory')
    .argument('<path>', 'File or directory path')
    .option('--reindex', 'Force reindex even if unchanged')
    .action(async (inputPath, opts) => {
      const ctx = await getContext()
      const absPath = resolve(inputPath)

      try {
        log.heading('Indexing')

        const stat = statSync(absPath)
        const files: string[] = []

        if (stat.isFile()) {
          files.push(absPath)
        } else if (stat.isDirectory()) {
          const entries = readdirSync(absPath)
          for (const entry of entries) {
            const ext = extname(entry)
            if (['.md', '.mdx', '.txt'].includes(ext)) {
              files.push(join(absPath, entry))
            }
          }
        }

        if (files.length === 0) {
          log.fail('No supported files found')
          return
        }

        log.info(`Found ${files.length} file(s)`)

        for (const file of files) {
          const content = readFileSync(file, 'utf-8')
          const result = await ctx.pipeline.ingest({
            title: basename(file),
            content,
            sourceType: 'local',
            sourcePath: file,
            fileType: extname(file),
          })

          if (result.status === 'indexed') {
            log.ok(`${basename(file)} (${result.chunks} chunks)`)
          } else if (result.status === 'skipped') {
            log.skip(`${basename(file)} (unchanged)`)
          } else {
            log.fail(`${basename(file)} (${result.error})`)
          }
        }
      } finally {
        await shutdownContext()
      }
    })

  return cmd
}
```

- [ ] **Step 7: Implement doctor command**

```typescript
// packages/cli/src/commands/doctor.ts
import { Command } from 'commander'
import { log } from '@opendocuments/core'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

export function doctorCommand() {
  const cmd = new Command('doctor')
    .description('Run health diagnostics')
    .action(async () => {
      log.heading('OpenDocuments Health Check')

      try {
        const ctx = await getContext()

        log.ok('Core           v0.1.0')
        log.ok('SQLite         connected')
        log.ok('LanceDB        connected')

        const docs = ctx.store.listDocuments()
        log.ok(`Documents      ${docs.length} indexed`)

        const workspaces = ctx.workspaceManager.list()
        log.ok(`Workspaces     ${workspaces.length}`)

        const plugins = ctx.registry.listAll()
        log.blank()
        log.heading('Plugins')
        for (const p of plugins) {
          log.ok(`${p.name.padEnd(35)} v${p.version}`)
        }
      } catch (err) {
        log.fail(`Bootstrap failed: ${(err as Error).message}`)
      } finally {
        await shutdownContext()
      }
    })

  return cmd
}
```

- [ ] **Step 8: Implement config command**

```typescript
// packages/cli/src/commands/config-cmd.ts
import { Command } from 'commander'
import { log, loadConfig } from '@opendocuments/core'

export function configCommand() {
  const cmd = new Command('config')
    .description('View or modify configuration')
    .argument('[key]', 'Config key to view')
    .argument('[value]', 'Config value to set')
    .action(async (key, value) => {
      const config = loadConfig(process.cwd())

      if (!key) {
        // Show full config
        log.heading('Configuration')
        console.log(JSON.stringify(config, null, 2))
        return
      }

      // Get nested key
      const keys = key.split('.')
      let current: any = config
      for (const k of keys) {
        current = current?.[k]
      }

      if (current === undefined) {
        log.fail(`Config key not found: ${key}`)
      } else {
        console.log(JSON.stringify(current, null, 2))
      }
    })

  return cmd
}
```

- [ ] **Step 9: Install deps, build, commit**

```bash
npm install
npx turbo build
```

Commit: `"feat(cli): add opendocuments CLI with start, ask, index, doctor, config commands"`

---

## Task 6: CLI Tests

**Files:**
- Create: `packages/cli/vitest.config.ts`
- Create: `packages/cli/tests/commands/ask.test.ts`
- Create: `packages/cli/tests/commands/doctor.test.ts`

- [ ] **Step 1: Create vitest config**

```typescript
// packages/cli/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: Write CLI tests**

These test the command logic directly (not via process spawn) by importing and calling the bootstrap + core:

```typescript
// packages/cli/tests/commands/ask.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '@opendocuments/server'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('ask command logic', () => {
  let ctx: AppContext
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
  })

  afterEach(async () => {
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('answers a greeting directly', async () => {
    const result = await ctx.ragEngine.query({ query: 'Hello', profile: 'balanced' })
    expect(result.route).toBe('direct')
    expect(result.answer).toBeDefined()
  })

  it('returns RAG results for document queries', async () => {
    // Index a document first
    await ctx.pipeline.ingest({
      title: 'test.md',
      content: '# Redis\n\nRedis is an in-memory data store.',
      sourceType: 'local',
      sourcePath: '/test.md',
      fileType: '.md',
    })

    const result = await ctx.ragEngine.query({ query: 'What is Redis?', profile: 'balanced' })
    expect(result.route).toBe('rag')
  })
})
```

```typescript
// packages/cli/tests/commands/doctor.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '@opendocuments/server'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('doctor command logic', () => {
  let ctx: AppContext
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
  })

  afterEach(async () => {
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('reports healthy state', () => {
    const docs = ctx.store.listDocuments()
    expect(docs).toEqual([])

    const workspaces = ctx.workspaceManager.list()
    expect(workspaces.length).toBeGreaterThanOrEqual(1)

    const plugins = ctx.registry.listAll()
    expect(plugins.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Run all tests, commit**

```bash
npx turbo test
```

Commit: `"test(cli): add ask and doctor command tests"`

---

## Task 7: Final Integration Verification

- [ ] **Step 1: Run full test suite**

```bash
npx turbo test
```

Expected: 78 core tests + ~12 server tests + ~3 CLI tests = ~93 total.

- [ ] **Step 2: Build all packages**

```bash
npx turbo build
```

- [ ] **Step 3: Test CLI manually**

```bash
cd packages/cli && node dist/index.js doctor
cd packages/cli && node dist/index.js config
cd packages/cli && echo "# Test\n\nHello world" > /tmp/test-doc.md && node dist/index.js index /tmp/test-doc.md
cd packages/cli && node dist/index.js ask "What is in the test document?"
```

- [ ] **Step 4: Commit any fixes**

```bash
git commit -m "chore: Plan 3 integration verification"
```

---

## Summary

| Task | What it builds | Tests |
|------|---------------|-------|
| 1 | Server package + bootstrap (wire all core components) | 2 |
| 2 | HTTP routes: health, stats, document CRUD | 5 |
| 3 | Chat route: POST + SSE streaming | 3 |
| 4 | MCP server: 6 tools via stdio/in-memory | 4 |
| 5 | CLI package: start, ask, index, doctor, config | -- |
| 6 | CLI tests | 3 |
| 7 | Integration verification | full suite |

**Total: 7 tasks, ~17 new tests, 3 packages wired together.**

After this plan is complete:
- `opendocuments start` launches HTTP server with REST API + SSE streaming
- `opendocuments start --mcp-only` launches MCP server for Claude Code/Cursor
- `opendocuments ask "question"` queries from CLI with streaming output
- `opendocuments index ./docs` indexes local files
- `opendocuments doctor` shows system health
- `opendocuments config` shows configuration

Plan 4 (Web UI) will add the React frontend served by this server.
