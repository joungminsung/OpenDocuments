import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import {
  loadConfig,
  log,
  type OpenDocumentsConfig,
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
  PlainTextParser,
  StructuredDataParser,
  ArchiveParser,
  ConversationManager,
  ConnectorManager,
  APIKeyManager,
  PIIRedactor,
  AuditLogger,
  DocumentVersionManager,
  type DB,
  type VectorDB,
  type ModelPlugin,
  type PluginContext,
  type EmbeddingResult,
  type RerankResult,
  type GenerateOpts,
  type HealthStatus,
} from 'opendocuments-core'

/* ------------------------------------------------------------------ */
/*  Provider -> package mapping                                       */
/* ------------------------------------------------------------------ */

const PROVIDER_MAP: Record<string, string> = {
  ollama: 'opendocuments-model-ollama',
  openai: 'opendocuments-model-openai',
  anthropic: 'opendocuments-model-anthropic',
  google: 'opendocuments-model-google',
  grok: 'opendocuments-model-grok',
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
    name: '@opendocuments/stub-embedder',
    type: 'model',
    version: '0.1.0',
    coreVersion: '^0.1.0',
    capabilities: { embedding: true },
    async setup(_ctx: PluginContext): Promise<void> {},
    async teardown(): Promise<void> {},
    async healthCheck(): Promise<HealthStatus> {
      return { healthy: false, message: 'Stub embedder -- no real model configured. Search will not work.' }
    },
    async embed(texts: string[]): Promise<EmbeddingResult> {
      const dense = texts.map(() => new Array(dimensions).fill(0))
      return { dense }
    },
  }
}

function createStubLLM(): ModelPlugin {
  return {
    name: '@opendocuments/stub-llm',
    type: 'model',
    version: '0.1.0',
    coreVersion: '^0.1.0',
    capabilities: { llm: true },
    async setup(_ctx: PluginContext): Promise<void> {},
    async teardown(): Promise<void> {},
    async healthCheck(): Promise<HealthStatus> {
      return { healthy: false, message: 'Stub LLM -- no real model configured. Generation will not work.' }
    },
    async *generate(_prompt: string, _opts?: GenerateOpts): AsyncIterable<string> {
      yield '[ERROR] No LLM model configured. Please set up a model provider:\n'
      yield '  1. Install Ollama: https://ollama.com\n'
      yield '  2. Start Ollama: ollama serve\n'
      yield '  3. Pull a model: ollama pull qwen2.5:14b\n'
      yield '  4. Restart: opendocuments start\n'
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

async function loadSinglePlugin(
  provider: string,
  apiKey: string,
  baseUrl: string,
  llmModel: string,
  embeddingModel: string,
  pluginCtx: PluginContext,
): Promise<ModelPlugin | null> {
  const packageName = PROVIDER_MAP[provider]
  if (!packageName) {
    log.fail(`Unknown model provider: ${provider}.`)
    return null
  }

  try {
    log.wait(`Loading model plugin: ${packageName}`)
    const mod = await import(packageName)

    let plugin: ModelPlugin

    if (typeof mod.default === 'object' && mod.default !== null && typeof mod.default.setup === 'function') {
      plugin = mod.default
    } else if (typeof mod.default === 'function') {
      plugin = new mod.default()
    } else {
      const ClassName = Object.values(mod).find(
        (v) => typeof v === 'function' && (v as any).prototype?.setup,
      ) as any
      if (ClassName) {
        plugin = new ClassName()
      } else {
        throw new Error(`Plugin ${packageName} does not export a valid ModelPlugin`)
      }
    }

    const modelPluginCtx: PluginContext = {
      ...pluginCtx,
      config: {
        apiKey,
        baseUrl,
        llmModel,
        embeddingModel,
      } as any,
    }

    await plugin.setup(modelPluginCtx)
    return plugin
  } catch (err) {
    log.fail(`Failed to load ${packageName}: ${(err as Error).message}. Using stub models.`)
    return null
  }
}

async function loadModelPlugin(
  provider: string,
  modelConfig: OpenDocumentsConfig['model'],
  pluginCtx: PluginContext,
  embeddingDimensions: number,
): Promise<{ embedder: ModelPlugin; llm: ModelPlugin }> {
  const packageName = PROVIDER_MAP[provider]

  if (!packageName) {
    log.fail(`Unknown model provider: ${provider}. Using stub models.`)
    return createStubModels(embeddingDimensions)
  }

  try {
    const mainPlugin = await loadSinglePlugin(
      provider,
      modelConfig.apiKey || '',
      modelConfig.baseUrl || '',
      modelConfig.llm,
      modelConfig.embedding,
      pluginCtx,
    )

    if (!mainPlugin) {
      return createStubModels(embeddingDimensions)
    }

    // Probe the embedding capability with a test call to verify the plugin is
    // actually functional (e.g. the remote model server is running with the
    // required model installed). Fall back to stubs on any failure so that the
    // server can still start and serve requests in degraded mode.
    if (mainPlugin.capabilities.embedding && mainPlugin.embed) {
      try {
        await mainPlugin.embed(['probe'])
      } catch (probeErr) {
        log.fail(`Model plugin ${packageName} embed probe failed: ${(probeErr as Error).message}. Using stub models.`)
        return createStubModels(embeddingDimensions)
      }
    }

    // If the main plugin doesn't support embedding, load a secondary embedding provider
    if (!mainPlugin.capabilities.embedding) {
      const embeddingProvider = modelConfig.embeddingProvider || 'ollama'
      log.info(`Main provider '${provider}' does not support embedding. Loading secondary embedding provider: ${embeddingProvider}`)

      const embeddingPlugin = await loadSinglePlugin(
        embeddingProvider,
        modelConfig.embeddingApiKey || modelConfig.apiKey || '',
        modelConfig.baseUrl || '',
        modelConfig.llm,
        modelConfig.embedding,
        pluginCtx,
      )

      if (embeddingPlugin && embeddingPlugin.capabilities.embedding && embeddingPlugin.embed) {
        try {
          await embeddingPlugin.embed(['probe'])
          return { embedder: embeddingPlugin, llm: mainPlugin }
        } catch (probeErr) {
          log.fail(`Secondary embedding provider '${embeddingProvider}' probe failed: ${(probeErr as Error).message}. Falling back to stub embedder.`)
        }
      } else if (embeddingPlugin) {
        log.fail(`Secondary embedding provider '${embeddingProvider}' does not support embedding. Falling back to stub embedder.`)
      }

      // Last resort: stub embedder
      return { embedder: createStubEmbedder(embeddingDimensions), llm: mainPlugin }
    }

    return { embedder: mainPlugin, llm: mainPlugin }
  } catch (err) {
    log.fail(`Failed to load model plugin ${packageName}: ${(err as Error).message}. Using stub models.`)
    return createStubModels(embeddingDimensions)
  }
}

/* ------------------------------------------------------------------ */
/*  Public types                                                      */
/* ------------------------------------------------------------------ */

export interface BootstrapOptions {
  dataDir?: string
  projectDir?: string
  /** Partial config overrides applied on top of loaded config (useful for tests) */
  configOverrides?: Partial<OpenDocumentsConfig>
}

export interface AppContext {
  config: OpenDocumentsConfig
  db: DB
  vectorDb: VectorDB
  registry: PluginRegistry
  eventBus: EventBus
  middleware: MiddlewareRunner
  workspaceManager: WorkspaceManager
  conversationManager: ConversationManager
  store: DocumentStore
  pipeline: IngestPipeline
  ragEngine: RAGEngine
  connectorManager: ConnectorManager
  apiKeyManager: APIKeyManager
  auditLogger: AuditLogger
  shutdown: () => Promise<void>
}

/* ------------------------------------------------------------------ */
/*  Bootstrap                                                         */
/* ------------------------------------------------------------------ */

export async function bootstrap(opts: BootstrapOptions = {}): Promise<AppContext> {
  // 1. Load config
  const projectDir = opts.projectDir || process.cwd()
  const baseConfig = loadConfig(projectDir)
  let config: OpenDocumentsConfig = baseConfig
  if (opts.configOverrides) {
    config = { ...baseConfig }
    const overrides = opts.configOverrides as Record<string, unknown>
    for (const [key, value] of Object.entries(overrides)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (config as any)[key] === 'object') {
        (config as any)[key] = { ...(config as any)[key], ...value }
      } else {
        (config as any)[key] = value
      }
    }
  }

  // Resolve dataDir
  const dataDir = opts.dataDir || process.env.OPENDOCUMENTS_DATA_DIR || config.storage.dataDir.replace(/^~/, process.env.HOME || '~')
  mkdirSync(dataDir, { recursive: true })

  // Resolve embedding dimensions from config or provider default
  const embeddingDimensions =
    config.model.embeddingDimensions ||
    EMBEDDING_DIMENSIONS[config.model.provider] ||
    EMBEDDING_DIMENSIONS.default

  // 2. Create SQLite DB
  const dbPath = join(dataDir, 'opendocuments.db')
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

    // 7. Register built-in parsers
    const markdownParser = new MarkdownParser()
    await registry.register(markdownParser, pluginCtx)
    const plainTextParser = new PlainTextParser()
    await registry.register(plainTextParser, pluginCtx)
    const structuredDataParser = new StructuredDataParser()
    await registry.register(structuredDataParser, pluginCtx)
    const archiveParser = new ArchiveParser()
    await registry.register(archiveParser, pluginCtx)

    // Auto-register installed parser plugins
    const PARSER_PLUGINS = [
      'opendocuments-parser-pdf',
      'opendocuments-parser-docx',
      'opendocuments-parser-xlsx',
      'opendocuments-parser-html',
      'opendocuments-parser-jupyter',
      'opendocuments-parser-email',
      'opendocuments-parser-pptx',
      'opendocuments-parser-code',
    ]

    for (const name of PARSER_PLUGINS) {
      try {
        const mod = await import(name)
        const ParserClass = mod.default
        if (typeof ParserClass === 'function') {
          const parser = new ParserClass()
          await registry.register(parser, pluginCtx)
        }
      } catch {
        // Plugin not installed -- skip silently
      }
    }

    // 8. Load model plugin (or fall back to stubs)
    const { embedder, llm } = await loadModelPlugin(
      config.model.provider,
      config.model,
      pluginCtx,
      embeddingDimensions,
    )
    await registry.register(embedder, pluginCtx)
    if (llm.name !== embedder.name) await registry.register(llm, pluginCtx)

    // Print degraded mode warning if using stub models
    const usingStubEmbedder = embedder.name.includes('stub')
    const usingStubLLM = llm.name.includes('stub')
    if (usingStubEmbedder || usingStubLLM) {
      log.blank()
      log.fail('╔══════════════════════════════════════════════════════════╗')
      log.fail('║  ⚠  DEGRADED MODE -- Model plugins not fully loaded     ║')
      log.fail('╚══════════════════════════════════════════════════════════╝')
      if (usingStubEmbedder) log.fail('  Embedding: using zero-vector stubs (search will not work)')
      if (usingStubLLM)      log.fail('  LLM:       using placeholder (generation will not work)')
      log.blank()
      log.info('To fix:')
      if (config.model.provider === 'ollama') {
        log.arrow('1. Ensure Ollama is running:  ollama serve')
        log.arrow(`2. Pull required models:      ollama pull ${config.model.llm}`)
        if (config.model.embedding !== config.model.llm) {
          log.arrow(`                              ollama pull ${config.model.embedding}`)
        }
        log.arrow('3. Restart:                   opendocuments start')
      } else {
        log.arrow(`1. Check your ${config.model.provider} API key is set correctly`)
        log.arrow('2. Run: opendocuments doctor')
      }
      log.blank()
    }

    // 9. Create WorkspaceManager, ensure default workspace
    const workspaceManager = new WorkspaceManager(db)
    const defaultWorkspace = workspaceManager.ensureDefault()

    // 10. Create DocumentStore (with workspace ID from default workspace)
    const store = new DocumentStore(db, vectorDb, defaultWorkspace.id)
    await store.initialize(embeddingDimensions)

    // 11. Create IngestPipeline and RAGEngine
    const autoRedactConfig = config.security.dataPolicy.autoRedact
    const redactor = new PIIRedactor(autoRedactConfig)

    const versionManager = new DocumentVersionManager(db)

    const pipeline = new IngestPipeline({
      store,
      registry,
      eventBus,
      middleware,
      embeddingDimensions,
      config,
      redactor,
      versionManager,
    })

    // Capture for shutdown closure
    const dbRef = db
    const vectorDbRef = vectorDb

    // Load web search provider if Tavily API key is configured
    let webSearchProvider: unknown = undefined
    const tavilyApiKey = process.env.TAVILY_API_KEY
    if (tavilyApiKey) {
      try {
        const wsModuleName = '@opendocuments/connector-web-search'
        const { WebSearchProvider } = await import(/* @vite-ignore */ wsModuleName)
        const wsp = new WebSearchProvider()
        await wsp.setup({
          config: { provider: 'tavily', apiKey: tavilyApiKey } as any,
          dataDir,
          log: pluginCtx.log,
        })
        const health = await wsp.healthCheck()
        if (health.healthy) {
          webSearchProvider = wsp
          log.ok('Web search provider (Tavily) loaded')
        }
      } catch {
        // connector-web-search not installed or failed -- skip silently
      }
    }

    const ragEngine = new RAGEngine({
      store,
      llm,
      embedder,
      eventBus,
      defaultProfile: config.rag.profile,
      customProfileConfig: config.rag.custom,
      webSearchProvider,
    })

    // 12. Create ConversationManager
    const conversationManager = new ConversationManager(db, defaultWorkspace.id)

    // 13. Create APIKeyManager and AuditLogger
    const apiKeyManager = new APIKeyManager(db)
    const auditLogger = new AuditLogger(db, config.security.audit)

    // 14. Create ConnectorManager
    const connectorManager = new ConnectorManager(pipeline, store, eventBus, db, defaultWorkspace.id)

    // 15. Start auto-purge scheduler (hard-delete soft-deleted records older than 30 days)
    // Auto-purge timer. Cleared in shutdown(). If bootstrap is called multiple times
    // (e.g., in tests), each instance must be properly shut down to prevent timer leaks.
    const PURGE_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours
    const purgeTimer = setInterval(() => {
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        // Hard delete documents that have been soft-deleted for 30+ days
        const expired = dbRef.all<any>(
          'SELECT id FROM documents WHERE deleted_at IS NOT NULL AND deleted_at < ?',
          [thirtyDaysAgo]
        )
        for (const doc of expired) {
          store.hardDeleteDocument(doc.id).catch(() => {})
        }
        // Also clean expired conversations
        dbRef.run('DELETE FROM conversations WHERE deleted_at IS NOT NULL AND deleted_at < ?', [thirtyDaysAgo])
      } catch {}
    }, PURGE_INTERVAL)

    // Connector type -> package mapping
    const CONNECTOR_PLUGINS_MAP: Record<string, string> = {
      github: 'opendocuments-connector-github',
      notion: 'opendocuments-connector-notion',
      'web-crawler': 'opendocuments-connector-web-crawler',
      'gdrive': '@opendocuments/connector-gdrive',
      'google-drive': '@opendocuments/connector-gdrive',
      's3': '@opendocuments/connector-s3',
      'gcs': '@opendocuments/connector-s3',
      'confluence': '@opendocuments/connector-confluence',
      'swagger': 'opendocuments-connector-swagger',
      'openapi': 'opendocuments-connector-swagger',
    }

    // Config-driven connector registration
    for (const connectorConfig of config.connectors) {
      const packageName = CONNECTOR_PLUGINS_MAP[connectorConfig.type]
      if (!packageName) continue

      try {
        const mod = await import(packageName)
        const ConnectorClass = mod.default
        if (typeof ConnectorClass !== 'function') continue

        const connector = new ConnectorClass()

        // Create a context with connector-specific config
        const connectorCtx: PluginContext = {
          config: connectorConfig as unknown as Record<string, unknown>,
          dataDir,
          log: pluginCtx.log,
        }

        await registry.register(connector, connectorCtx)
        connectorManager.registerConnector(connector, {
          name: connectorConfig.type,
          syncIntervalSeconds: (connectorConfig as any).syncInterval || 300,
        })
      } catch (err) {
        log.fail(`Failed to load connector ${connectorConfig.type}: ${(err as Error).message}`)
      }
    }

    // Shutdown function
    const shutdown = async (): Promise<void> => {
      clearInterval(purgeTimer)
      connectorManager.stopAll()
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
      conversationManager,
      store,
      pipeline,
      ragEngine,
      connectorManager,
      apiKeyManager,
      auditLogger,
      shutdown,
    }
  } catch (err) {
    // Cleanup partially initialized resources
    if (vectorDb) await vectorDb.close().catch(() => {})
    if (db) db.close()
    throw err
  }
}
