import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import {
  loadConfig,
  log,
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
  PlainTextParser,
  ConversationManager,
  ConnectorManager,
  APIKeyManager,
  PIIRedactor,
  AuditLogger,
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
  modelConfig: OpenDocsConfig['model'],
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
  configOverrides?: Partial<OpenDocsConfig>
}

export interface AppContext {
  config: OpenDocsConfig
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
  const config: OpenDocsConfig = opts.configOverrides
    ? { ...baseConfig, ...opts.configOverrides }
    : baseConfig

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

    // 7. Register built-in parsers
    const markdownParser = new MarkdownParser()
    await registry.register(markdownParser, pluginCtx)
    const plainTextParser = new PlainTextParser()
    await registry.register(plainTextParser, pluginCtx)

    // Auto-register installed parser plugins
    const PARSER_PLUGINS = [
      '@opendocs/parser-pdf',
      '@opendocs/parser-docx',
      '@opendocs/parser-xlsx',
      '@opendocs/parser-html',
      '@opendocs/parser-jupyter',
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

    // 9. Create WorkspaceManager, ensure default workspace
    const workspaceManager = new WorkspaceManager(db)
    const defaultWorkspace = workspaceManager.ensureDefault()

    // 10. Create DocumentStore (with workspace ID from default workspace)
    const store = new DocumentStore(db, vectorDb, defaultWorkspace.id)
    await store.initialize(embeddingDimensions)

    // 11. Create IngestPipeline and RAGEngine
    const autoRedactConfig = config.security.dataPolicy.autoRedact
    const redactor = new PIIRedactor(autoRedactConfig)

    const pipeline = new IngestPipeline({
      store,
      registry,
      eventBus,
      middleware,
      embeddingDimensions,
      config,
      redactor,
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
      customProfileConfig: config.rag.custom,
    })

    // 12. Create ConversationManager
    const conversationManager = new ConversationManager(db, defaultWorkspace.id)

    // Note: @opendocs/connector-web-search is a query-time utility, not an index-time connector.
    // It is loaded on-demand by the RAG engine when webSearch profile feature is enabled.

    // 13. Create APIKeyManager and AuditLogger
    const apiKeyManager = new APIKeyManager(db)
    const auditLogger = new AuditLogger(db, config.security.audit)

    // 14. Create ConnectorManager
    const connectorManager = new ConnectorManager(pipeline, store, eventBus, db, defaultWorkspace.id)

    // Connector type -> package mapping
    const CONNECTOR_PLUGINS_MAP: Record<string, string> = {
      github: '@opendocs/connector-github',
      notion: '@opendocs/connector-notion',
      'web-crawler': '@opendocs/connector-web-crawler',
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
