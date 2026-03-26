import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import {
  loadConfig,
  type OpenDocsConfig,
  createSQLiteDB,
  runMigrations,
  createLanceDB,
  PluginRegistry,
  EventBus,
  MiddlewareRunner,
  WorkspaceManager,
  DocumentStore,
  IngestPipeline,
  RAGEngine,
  MarkdownParser,
  type DB,
  type VectorDB,
  type ModelPlugin,
  type PluginContext,
  type EmbeddingResult,
  type RerankResult,
  type GenerateOpts,
  type HealthStatus,
} from '@opendocs/core'

/* ------------------------------------------------------------------ */
/*  Provider -> package mapping                                       */
/* ------------------------------------------------------------------ */

const PROVIDER_MAP: Record<string, string> = {
  ollama: '@opendocs/model-ollama',
  openai: '@opendocs/model-openai',
  anthropic: '@opendocs/model-anthropic',
  google: '@opendocs/model-google',
  grok: '@opendocs/model-grok',
}

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  ollama: 1024,
  openai: 1536,
  google: 768,
  grok: 1536,
  default: 384,
}

/* ------------------------------------------------------------------ */
/*  Stub models (fallback when plugin unavailable)                    */
/* ------------------------------------------------------------------ */

function createStubEmbedder(dimensions: number): ModelPlugin {
  return {
    name: '@opendocs/stub-embedder',
    type: 'model',
    version: '0.1.0',
    coreVersion: '^0.1.0',
    capabilities: { embedding: true },
    async setup(_ctx: PluginContext): Promise<void> {},
    async teardown(): Promise<void> {},
    async healthCheck(): Promise<HealthStatus> {
      return { healthy: true, message: 'Stub embedder' }
    },
    async embed(texts: string[]): Promise<EmbeddingResult> {
      const dense = texts.map(() => new Array(dimensions).fill(0))
      return { dense }
    },
  }
}

function createStubLLM(): ModelPlugin {
  return {
    name: '@opendocs/stub-llm',
    type: 'model',
    version: '0.1.0',
    coreVersion: '^0.1.0',
    capabilities: { llm: true },
    async setup(_ctx: PluginContext): Promise<void> {},
    async teardown(): Promise<void> {},
    async healthCheck(): Promise<HealthStatus> {
      return { healthy: true, message: 'Stub LLM' }
    },
    async *generate(_prompt: string, _opts?: GenerateOpts): AsyncIterable<string> {
      yield 'This is a placeholder response. Configure a real LLM model plugin for actual generation.'
    },
  }
}

function createStubModels(dimensions: number) {
  const embedder = createStubEmbedder(dimensions)
  const llm = createStubLLM()
  return { embedder, llm }
}

/* ------------------------------------------------------------------ */
/*  Dynamic model plugin loader                                       */
/* ------------------------------------------------------------------ */

async function loadModelPlugin(
  provider: string,
  modelConfig: OpenDocsConfig['model'],
  pluginCtx: PluginContext,
  embeddingDimensions: number,
): Promise<{ embedder: ModelPlugin; llm: ModelPlugin }> {
  const packageName = PROVIDER_MAP[provider]

  if (!packageName) {
    console.warn(`Unknown model provider: ${provider}. Using stub models.`)
    return createStubModels(embeddingDimensions)
  }

  try {
    const mod = await import(packageName)

    let plugin: ModelPlugin

    if (typeof mod.default === 'object' && mod.default !== null && typeof mod.default.setup === 'function') {
      // Default export is a plugin instance
      plugin = mod.default
    } else if (typeof mod.default === 'function') {
      // Default export is a class
      plugin = new mod.default()
    } else {
      // Try named exports
      const ClassName = Object.values(mod).find(
        (v) => typeof v === 'function' && (v as any).prototype?.setup,
      ) as any
      if (ClassName) {
        plugin = new ClassName()
      } else {
        throw new Error(`Plugin ${packageName} does not export a valid ModelPlugin`)
      }
    }

    // Set up plugin with model-specific config
    const modelPluginCtx: PluginContext = {
      ...pluginCtx,
      config: {
        apiKey: modelConfig.apiKey || '',
        baseUrl: modelConfig.baseUrl || '',
        llmModel: modelConfig.llm,
        embeddingModel: modelConfig.embedding,
      } as any,
    }

    await plugin.setup(modelPluginCtx)

    // If the plugin supports embedding use it; otherwise fall back to stub embedder
    const embedder = plugin.capabilities.embedding
      ? plugin
      : createStubEmbedder(embeddingDimensions)

    return { embedder, llm: plugin }
  } catch (err) {
    console.warn(
      `Failed to load model plugin ${packageName}: ${(err as Error).message}. Using stub models.`,
    )
    return createStubModels(embeddingDimensions)
  }
}

/* ------------------------------------------------------------------ */
/*  Public types                                                      */
/* ------------------------------------------------------------------ */

export interface BootstrapOptions {
  dataDir?: string
  projectDir?: string
}

export interface AppContext {
  config: OpenDocsConfig
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

/* ------------------------------------------------------------------ */
/*  Bootstrap                                                         */
/* ------------------------------------------------------------------ */

export async function bootstrap(opts: BootstrapOptions = {}): Promise<AppContext> {
  // 1. Load config
  const projectDir = opts.projectDir || process.cwd()
  const config = loadConfig(projectDir)

  // Resolve dataDir
  const dataDir = opts.dataDir || config.storage.dataDir.replace(/^~/, process.env.HOME || '~')
  mkdirSync(dataDir, { recursive: true })

  // Resolve embedding dimensions from config or provider default
  const embeddingDimensions =
    config.model.embeddingDimensions ||
    EMBEDDING_DIMENSIONS[config.model.provider] ||
    EMBEDDING_DIMENSIONS.default

  // 2. Create SQLite DB
  const dbPath = join(dataDir, 'opendocs.db')
  let db: DB | null = null
  let vectorDb: VectorDB | null = null

  try {
    db = createSQLiteDB(dbPath)

    // 3. Run migrations
    runMigrations(db)

    // 4. Create LanceDB
    const vectorDir = join(dataDir, 'vectors')
    mkdirSync(vectorDir, { recursive: true })
    vectorDb = await createLanceDB(vectorDir)

    // 5. Create PluginRegistry, EventBus, MiddlewareRunner
    const registry = new PluginRegistry()
    const eventBus = new EventBus()
    const middleware = new MiddlewareRunner()

    // 6. Create plugin context for setup calls
    const pluginCtx: PluginContext = {
      config: {},
      dataDir,
      log: {
        ok: (msg: string) => console.log(`[ok] ${msg}`),
        fail: (msg: string) => console.error(`[fail] ${msg}`),
        info: (msg: string) => console.log(`[info] ${msg}`),
        wait: (msg: string) => console.log(`[wait] ${msg}`),
      },
    }

    // 7. Register built-in MarkdownParser
    const markdownParser = new MarkdownParser()
    await registry.register(markdownParser, pluginCtx)

    // 8. Load model plugin (or fall back to stubs)
    const { embedder, llm } = await loadModelPlugin(
      config.model.provider,
      config.model,
      pluginCtx,
      embeddingDimensions,
    )
    await registry.register(embedder, pluginCtx)
    if (llm !== embedder) await registry.register(llm, pluginCtx)

    // 9. Create WorkspaceManager, ensure default workspace
    const workspaceManager = new WorkspaceManager(db)
    const defaultWorkspace = workspaceManager.ensureDefault()

    // 10. Create DocumentStore (with workspace ID from default workspace)
    const store = new DocumentStore(db, vectorDb, defaultWorkspace.id)
    await store.initialize(embeddingDimensions)

    // 11. Create IngestPipeline and RAGEngine
    const pipeline = new IngestPipeline({
      store,
      registry,
      eventBus,
      middleware,
      embeddingDimensions,
    })

    // Capture for shutdown closure
    const dbRef = db
    const vectorDbRef = vectorDb

    const ragEngine = new RAGEngine({
      store,
      llm,
      embedder,
      eventBus,
      defaultProfile: config.rag.profile,
    })

    // Shutdown function
    const shutdown = async (): Promise<void> => {
      await registry.teardownAll()
      eventBus.removeAllListeners()
      await vectorDbRef.close()
      dbRef.close()
    }

    return {
      config,
      db,
      vectorDb,
      registry,
      eventBus,
      middleware,
      workspaceManager,
      store,
      pipeline,
      ragEngine,
      shutdown,
    }
  } catch (err) {
    // Cleanup partially initialized resources
    if (vectorDb) await vectorDb.close().catch(() => {})
    if (db) db.close()
    throw err
  }
}
