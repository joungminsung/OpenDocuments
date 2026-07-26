import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { checkForUpdates } from './utils/update-checker.js'
import { SERVER_VERSION } from './version.js'
import {
  loadConfig,
  log,
  type OpenDocumentsConfig,
  createSQLiteDB,
  runMigrations,
  createLanceDB,
  PluginRegistry,
  EventBus,
  WebhookDispatcher,
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
  TagManager,
  CollectionManager,
  type DB,
  type VectorDB,
  type ModelPlugin,
  type PluginContext,
  type ConnectorPlugin,
  type AnyPlugin,
  type EmbeddingResult,
  type RerankResult,
  type GenerateOpts,
  type HealthStatus,
  isOllamaRunning,
} from 'opendocuments-core'

async function importPackage(packageName: string, projectDir: string): Promise<Record<string, unknown>> {
  try {
    const projectRequire = createRequire(join(projectDir, 'package.json'))
    const resolved = projectRequire.resolve(packageName)
    return await import(pathToFileURL(resolved).href) as Record<string, unknown>
  } catch {
    return await import(packageName) as Record<string, unknown>
  }
}

function instantiatePlugin<T extends AnyPlugin>(mod: Record<string, unknown>, packageName: string): T {
  const exported = mod.default ?? mod
  if (typeof exported === 'object' && exported !== null && typeof (exported as AnyPlugin).setup === 'function') {
    return exported as T
  }
  if (typeof exported === 'function') {
    return new (exported as new () => T)()
  }
  const PluginClass = Object.values(mod).find(
    (value) => typeof value === 'function' && typeof (value as { prototype?: { setup?: unknown } }).prototype?.setup === 'function'
  )
  if (typeof PluginClass === 'function') {
    return new (PluginClass as new () => T)()
  }
  throw new Error(`Plugin ${packageName} does not export a valid OpenDocuments plugin`)
}

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
  google: 3072,
  default: 384,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeConfigRecords(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key]
    merged[key] = isRecord(current) && isRecord(value)
      ? mergeConfigRecords(current, value)
      : value
  }
  return merged
}

/* ------------------------------------------------------------------ */
/*  Stub models (fallback when plugin unavailable)                    */
/* ------------------------------------------------------------------ */

function createStubEmbedder(dimensions: number): ModelPlugin {
  return {
    name: '@opendocuments/stub-embedder',
    type: 'model',
    version: '0.3.0',
    coreVersion: '^0.3.0',
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
    version: '0.3.0',
    coreVersion: '^0.3.0',
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
  registry: PluginRegistry,
  projectDir: string,
): Promise<ModelPlugin | null> {
  const packageName = PROVIDER_MAP[provider]
  if (!packageName) {
    log.fail(`Unknown model provider: ${provider}.`)
    return null
  }

  try {
    log.wait(`Loading model plugin: ${packageName}`)
    const mod = await importPackage(packageName, projectDir)
    const plugin = instantiatePlugin<ModelPlugin>(mod, packageName)

    const modelPluginCtx: PluginContext = {
      ...pluginCtx,
      config: {
        apiKey,
        baseUrl,
        llmModel,
        embeddingModel,
      },
    }

    await registry.register(plugin, modelPluginCtx)
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
  registry: PluginRegistry,
  projectDir: string,
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
      registry,
      projectDir,
    )

    if (!mainPlugin) {
      return createStubModels(embeddingDimensions)
    }

    // Probe retry configuration (configurable for tests: OPENDOCUMENTS_PROBE_RETRIES=1)
    const maxRetries = parseInt(process.env.OPENDOCUMENTS_PROBE_RETRIES || '3', 10)
    const retryDelay = parseInt(process.env.OPENDOCUMENTS_PROBE_DELAY_MS || '3000', 10)

    // Probe the embedding capability with a test call to verify the plugin is
    // actually functional (e.g. the remote model server is running with the
    // required model installed). Fall back to stubs on any failure so that the
    // server can still start and serve requests in degraded mode.
    if (mainPlugin.capabilities.embedding && mainPlugin.embed) {
      let probeSuccess = false
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await mainPlugin.embed(['probe'])
          probeSuccess = true
          break
        } catch (probeErr) {
          const msg = (probeErr as Error).message
          if (attempt < maxRetries) {
            log.wait(`Model embed probe failed (attempt ${attempt}/${maxRetries}): ${msg}. Retrying in ${retryDelay / 1000}s...`)
            await new Promise(r => setTimeout(r, retryDelay))
          } else {
            log.fail(`Model plugin ${packageName} embed probe failed after ${maxRetries} attempts: ${msg}. Using stub models.`)
          }
        }
      }
      if (!probeSuccess) {
        await registry.unregister(mainPlugin.name)
        return createStubModels(embeddingDimensions)
      }
    }

    // If the main plugin doesn't support embedding, load a secondary embedding provider
    if (!mainPlugin.capabilities.embedding) {
      const embeddingProvider = modelConfig.embeddingProvider || 'ollama'
      log.info(`Main provider '${provider}' does not support embedding. Loading secondary embedding provider: ${embeddingProvider}`)

      const embeddingPlugin = await loadSinglePlugin(
        embeddingProvider,
        modelConfig.embeddingApiKey || (embeddingProvider === provider ? modelConfig.apiKey : '') || '',
        modelConfig.embeddingBaseUrl || (embeddingProvider === provider ? modelConfig.baseUrl : '') || '',
        modelConfig.llm,
        modelConfig.embedding,
        pluginCtx,
        registry,
        projectDir,
      )

      if (embeddingPlugin && embeddingPlugin.capabilities.embedding && embeddingPlugin.embed) {
        let secondaryProbeSuccess = false
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await embeddingPlugin.embed(['probe'])
            secondaryProbeSuccess = true
            break
          } catch (probeErr) {
            const msg = (probeErr as Error).message
            if (attempt < maxRetries) {
              log.wait(`Secondary embedding probe failed (attempt ${attempt}/${maxRetries}): ${msg}. Retrying in ${retryDelay / 1000}s...`)
              await new Promise(r => setTimeout(r, retryDelay))
            } else {
              log.fail(`Secondary embedding provider '${embeddingProvider}' probe failed after ${maxRetries} attempts: ${msg}. Falling back to stub embedder.`)
            }
          }
        }
        if (secondaryProbeSuccess) {
          return { embedder: embeddingPlugin, llm: mainPlugin }
        }
        await registry.unregister(embeddingPlugin.name)
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
  readiness: {
    modelStatus: 'ready' | 'degraded'
    issues: Array<{
      code: 'model_unavailable'
      message: string
      action: string
    }>
    embeddingDimensions: number
    modelProvider: string
  }
  createConnector: (config: Record<string, unknown>) => Promise<ConnectorPlugin | null>
  pluginManifestPath: string
  forWorkspace: (workspaceId?: string) => WorkspaceServices
  shutdown: () => Promise<void>
}

export interface WorkspaceServices {
  workspaceId: string
  store: DocumentStore
  pipeline: IngestPipeline
  ragEngine: RAGEngine
  conversationManager: ConversationManager
  connectorManager: ConnectorManager
  tagManager: TagManager
  collectionManager: CollectionManager
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
    config = mergeConfigRecords(
      baseConfig as unknown as Record<string, unknown>,
      opts.configOverrides as unknown as Record<string, unknown>
    ) as unknown as OpenDocumentsConfig
  }

  // Resolve dataDir
  const dataDir = opts.dataDir || process.env.OPENDOCUMENTS_DATA_DIR || config.storage.dataDir.replace(/^~/, homedir())
  mkdirSync(dataDir, { recursive: true })
  const pluginManifestPath = join(dataDir, 'installed-plugins.json')

  if (config.storage.db !== 'sqlite') {
    throw new Error('Postgres storage is not implemented yet. Use storage.db = "sqlite".')
  }
  if (config.storage.vectorDb !== 'lancedb') {
    throw new Error('Qdrant storage is not implemented yet. Use storage.vectorDb = "lancedb".')
  }
  if (config.security.storage.encryptAtRest) {
    throw new Error(
      'security.storage.encryptAtRest is enabled, but application-level storage encryption is not implemented. '
      + 'Disable this flag and use an encrypted host volume, or do not start the instance.'
    )
  }

  const cloudProviders = new Set(['openai', 'anthropic', 'google', 'grok'])
  const usesCloudModel = cloudProviders.has(config.model.provider)
    || cloudProviders.has(config.model.embeddingProvider || '')
  if (usesCloudModel && !config.security.dataPolicy.allowCloudProcessing) {
    throw new Error(
      'Cloud model processing is blocked by security.dataPolicy.allowCloudProcessing=false. '
      + 'Choose a local model or explicitly allow cloud processing after reviewing the data policy.'
    )
  }

  // Resolve embedding dimensions from config or provider default
  const embeddingProvider = config.model.embeddingProvider ||
    (config.model.provider === 'anthropic' || config.model.provider === 'grok'
      ? 'ollama'
      : config.model.provider)
  const embeddingDimensions =
    config.model.embeddingDimensions ||
    EMBEDDING_DIMENSIONS[embeddingProvider] ||
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
    const sqliteDb = db
    const lanceDb = vectorDb

    // 5. Create PluginRegistry, EventBus, MiddlewareRunner
    const registry = new PluginRegistry()
    const eventBus = new EventBus()
    const middleware = new MiddlewareRunner()

    // Wire webhook dispatcher if any webhooks are configured
    let webhookDispatcher: WebhookDispatcher | undefined
    if (config.webhooks && config.webhooks.length > 0) {
      webhookDispatcher = new WebhookDispatcher(eventBus, config.webhooks)
    }

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

    let persistedPluginNames: string[] = []
    let disabledPluginNames: string[] = []
    if (existsSync(pluginManifestPath)) {
      try {
        const parsed = JSON.parse(readFileSync(pluginManifestPath, 'utf-8')) as unknown
        if (Array.isArray(parsed)) {
          persistedPluginNames = parsed.filter((name): name is string => typeof name === 'string')
        } else if (typeof parsed === 'object' && parsed !== null) {
          const manifest = parsed as { enabled?: unknown; disabled?: unknown }
          if (Array.isArray(manifest.enabled)) {
            persistedPluginNames = manifest.enabled.filter((name): name is string => typeof name === 'string')
          }
          if (Array.isArray(manifest.disabled)) {
            disabledPluginNames = manifest.disabled.filter((name): name is string => typeof name === 'string')
          }
        }
      } catch (err) {
        log.fail(`Failed to read installed plugin manifest: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const disabledPlugins = new Set(disabledPluginNames)
    for (const name of new Set([...config.plugins, ...persistedPluginNames])) {
      if (disabledPlugins.has(name)) continue
      if (registry.get(name)) continue
      try {
        const mod = await importPackage(name, projectDir)
        const plugin = instantiatePlugin<AnyPlugin>(mod, name)
        if (registry.get(plugin.name)) continue
        if (plugin.type === 'parser' || plugin.type === 'middleware') {
          await registry.register(plugin, pluginCtx)
        } else {
          log.info(`Plugin ${name} requires model or connector configuration and was not auto-activated`)
        }
      } catch (err) {
        log.fail(`Failed to load configured plugin ${name}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // 8. Load model plugin (or fall back to stubs). Model downloads are
    // deliberately confined to the interactive init flow so that a routine
    // service restart never starts a multi-gigabyte network transfer.
    const { embedder, llm } = await loadModelPlugin(
      config.model.provider,
      config.model,
      pluginCtx,
      embeddingDimensions,
      registry,
      projectDir,
    )
    if (!registry.get(embedder.name)) await registry.register(embedder, pluginCtx)
    if (llm.name !== embedder.name && !registry.get(llm.name)) await registry.register(llm, pluginCtx)

    // Print degraded mode warning if using stub models.
    const usingStubEmbedder = embedder.name.includes('stub')
    const usingStubLLM = llm.name.includes('stub')
    if (usingStubEmbedder || usingStubLLM) {
      log.blank()
      log.fail('╔══════════════════════════════════════════════════════════╗')
      log.fail('║     DEGRADED MODE -- Model plugins not fully loaded     ║')
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
    const readiness: AppContext['readiness'] = {
      modelStatus: usingStubEmbedder || usingStubLLM ? 'degraded' : 'ready',
      issues: usingStubEmbedder || usingStubLLM
        ? [{
            code: 'model_unavailable',
            message: 'The configured generation or embedding model is unavailable.',
            action: config.model.provider === 'ollama'
              ? `Run "ollama serve", then pull "${config.model.llm}" and "${config.model.embedding}", and restart OpenDocuments.`
              : `Verify the ${config.model.provider} API key and run "opendocuments doctor".`,
          }]
        : [],
      embeddingDimensions,
      modelProvider: config.model.provider,
    }

    // 10. Create WorkspaceManager, ensure default workspace
    const workspaceManager = new WorkspaceManager(db)
    const defaultWorkspace = workspaceManager.ensure(config.workspace, config.mode)

    // 11. Create workspace-scoped services
    const documentStores = new Map<string, DocumentStore>()
    const pipelines = new Map<string, IngestPipeline>()
    const ragEngines = new Map<string, RAGEngine>()
    const conversationManagers = new Map<string, ConversationManager>()
    const connectorManagers = new Map<string, ConnectorManager>()
    const tagManagers = new Map<string, TagManager>()
    const collectionManagers = new Map<string, CollectionManager>()
    const extraConnectorInstances: ConnectorPlugin[] = []

    const ensureWorkspaceExists = (workspaceId: string) => {
      if (!workspaceManager.getById(workspaceId)) {
        throw new Error(`Workspace not found: ${workspaceId}`)
      }
    }

    const autoRedactConfig = config.security.dataPolicy.autoRedact
    const redactor = new PIIRedactor(autoRedactConfig)
    const versionManager = new DocumentVersionManager(db)

    const getStoreForWorkspace = (workspaceId: string) => {
      ensureWorkspaceExists(workspaceId)
      let scopedStore = documentStores.get(workspaceId)
      if (!scopedStore) {
        scopedStore = new DocumentStore(sqliteDb, lanceDb, workspaceId)
        documentStores.set(workspaceId, scopedStore)
      }
      return scopedStore
    }

    const getPipelineForWorkspace = (workspaceId: string) => {
      ensureWorkspaceExists(workspaceId)
      let scopedPipeline = pipelines.get(workspaceId)
      if (!scopedPipeline) {
        scopedPipeline = new IngestPipeline({
          store: getStoreForWorkspace(workspaceId),
          registry,
          eventBus,
          middleware,
          embeddingDimensions,
          config,
          redactor,
          versionManager,
        })
        pipelines.set(workspaceId, scopedPipeline)
      }
      return scopedPipeline
    }

    const getConversationManagerForWorkspace = (workspaceId: string) => {
      ensureWorkspaceExists(workspaceId)
      let manager = conversationManagers.get(workspaceId)
      if (!manager) {
        manager = new ConversationManager(sqliteDb, workspaceId)
        conversationManagers.set(workspaceId, manager)
      }
      return manager
    }

    const getTagManagerForWorkspace = (workspaceId: string) => {
      ensureWorkspaceExists(workspaceId)
      let manager = tagManagers.get(workspaceId)
      if (!manager) {
        manager = new TagManager(sqliteDb, workspaceId)
        tagManagers.set(workspaceId, manager)
      }
      return manager
    }

    const getCollectionManagerForWorkspace = (workspaceId: string) => {
      ensureWorkspaceExists(workspaceId)
      let manager = collectionManagers.get(workspaceId)
      if (!manager) {
        manager = new CollectionManager(sqliteDb, workspaceId)
        collectionManagers.set(workspaceId, manager)
      }
      return manager
    }

    const getConnectorManagerForWorkspace = (workspaceId: string) => {
      ensureWorkspaceExists(workspaceId)
      let manager = connectorManagers.get(workspaceId)
      if (!manager) {
        manager = new ConnectorManager(
          getPipelineForWorkspace(workspaceId),
          getStoreForWorkspace(workspaceId),
          eventBus,
          sqliteDb,
          workspaceId
        )
        connectorManagers.set(workspaceId, manager)
      }
      return manager
    }

    const store = getStoreForWorkspace(defaultWorkspace.id)
    await store.initialize(embeddingDimensions)

    // 12. Create IngestPipeline and RAGEngine
    const pipeline = getPipelineForWorkspace(defaultWorkspace.id)

    // Capture for shutdown closure
    const dbRef = sqliteDb
    const vectorDbRef = lanceDb

    // Load web search provider if Tavily API key is configured
    let webSearchProvider: unknown = undefined
    const tavilyApiKey = process.env.TAVILY_API_KEY
    if (tavilyApiKey) {
      try {
        const wsModuleName = '@opendocuments/connector-web-search'
        const { WebSearchProvider } = await import(/* @vite-ignore */ wsModuleName)
        const wsp = new WebSearchProvider()
        await wsp.setup({
          config: { provider: 'tavily', apiKey: tavilyApiKey },
          dataDir,
          log: pluginCtx.log,
        })
        const health = await wsp.healthCheck()
        if (health.healthy) {
          webSearchProvider = wsp
          log.ok('Web search provider (Tavily) loaded')
        }
      } catch (error) {
        log.info(`Web search provider unavailable: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    const getRAGEngineForWorkspace = (workspaceId: string) => {
      ensureWorkspaceExists(workspaceId)
      let scopedEngine = ragEngines.get(workspaceId)
      if (!scopedEngine) {
        scopedEngine = new RAGEngine({
          store: getStoreForWorkspace(workspaceId),
          llm,
          embedder,
          eventBus,
          defaultProfile: config.rag.profile,
          customProfileConfig: config.rag.custom,
          webSearchProvider,
        })
        ragEngines.set(workspaceId, scopedEngine)
      }
      return scopedEngine
    }

    const ragEngine = getRAGEngineForWorkspace(defaultWorkspace.id)

    // 13. Create ConversationManager
    const conversationManager = getConversationManagerForWorkspace(defaultWorkspace.id)

    // 14. Create APIKeyManager and AuditLogger
    const apiKeyManager = new APIKeyManager(db)
    const auditLogger = new AuditLogger(db, config.security.audit)

    // 15. Create ConnectorManager
    const connectorManager = getConnectorManagerForWorkspace(defaultWorkspace.id)

    // 16. Start auto-purge scheduler (hard-delete soft-deleted records older than 30 days)
    // Auto-purge timer. Cleared in shutdown(). If bootstrap is called multiple times
    // (e.g., in tests), each instance must be properly shut down to prevent timer leaks.
    const PURGE_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours
    const purgeTimer = setInterval(() => {
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        // Hard delete documents that have been soft-deleted for 30+ days
        const expired = dbRef.all<{ id: string; workspace_id: string }>(
          'SELECT id, workspace_id FROM documents WHERE deleted_at IS NOT NULL AND deleted_at < ?',
          [thirtyDaysAgo]
        )
        for (const doc of expired) {
          getStoreForWorkspace(doc.workspace_id).hardDeleteDocument(doc.id).catch((error) => {
            log.fail(`Failed to purge document ${doc.id}: ${error instanceof Error ? error.message : String(error)}`)
          })
        }
        // Also clean expired conversations
        dbRef.run('DELETE FROM conversations WHERE deleted_at IS NOT NULL AND deleted_at < ?', [thirtyDaysAgo])
      } catch (error) {
        log.fail(`Automatic purge failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }, PURGE_INTERVAL)

    // Connector type -> package mapping
    const CONNECTOR_PLUGINS_MAP: Record<string, string> = {
      github: '@opendocuments/connector-github',
      notion: '@opendocuments/connector-notion',
      'web-crawler': '@opendocuments/connector-web-crawler',
      'gdrive': '@opendocuments/connector-gdrive',
      'google-drive': '@opendocuments/connector-gdrive',
      's3': '@opendocuments/connector-s3',
      'gcs': '@opendocuments/connector-s3',
      'confluence': '@opendocuments/connector-confluence',
      'swagger': '@opendocuments/connector-swagger',
      'openapi': '@opendocuments/connector-swagger',
    }

    const createConnector = async (
      connectorConfig: Record<string, unknown>,
      dataDirForConnector: string
    ): Promise<ConnectorPlugin | null> => {
      const type = typeof connectorConfig.type === 'string' ? connectorConfig.type : ''
      const packageName = CONNECTOR_PLUGINS_MAP[type] || type
      if (!packageName) return null

      const mod = await importPackage(packageName, projectDir)
      const connector = instantiatePlugin<ConnectorPlugin>(mod, packageName)
      const connectorCtx: PluginContext = {
        config: connectorConfig,
        dataDir: dataDirForConnector,
        log: pluginCtx.log,
      }
      if (!registry.get(connector.name)) {
        await registry.register(connector, connectorCtx)
      } else {
        await connector.setup(connectorCtx)
        extraConnectorInstances.push(connector)
      }
      return connector
    }

    // Config-driven connector registration
    const configuredConnectorIds = new Set<string>()
    for (const connectorConfig of config.connectors) {
      try {
        const connectorRecord = connectorConfig as unknown as Record<string, unknown>
        const connector = await createConnector(connectorRecord, dataDir)
        if (!connector) continue
        const registration = {
          name: typeof connectorRecord.name === 'string' ? connectorRecord.name : connectorConfig.type,
          syncIntervalSeconds: typeof connectorRecord.syncInterval === 'number' ? connectorRecord.syncInterval : 300,
          autoSync: connectorConfig.watch || connectorRecord.autoSync === true,
          config: connectorRecord,
        }
        configuredConnectorIds.add(connectorManager.registerConnector(connector, registration))
      } catch (err) {
        log.fail(`Failed to load connector ${connectorConfig.type}: ${(err as Error).message}`)
      }
    }

    const persistedConnectors = db.all<{
      id: string
      workspace_id: string
      name: string
      type: string
      config: string
      sync_interval_seconds: number | null
    }>(
      `SELECT id, workspace_id, name, type, config, sync_interval_seconds
       FROM connectors
       WHERE deleted_at IS NULL`
    )
    for (const row of persistedConnectors) {
      if (configuredConnectorIds.has(row.id)) continue
      try {
        const parsedConfig = JSON.parse(row.config || '{}') as Record<string, unknown>
        const connectorType = typeof parsedConfig.type === 'string' ? parsedConfig.type : row.name
        const connector = await createConnector({ ...parsedConfig, type: connectorType }, dataDir)
        if (!connector) continue
        getConnectorManagerForWorkspace(row.workspace_id).registerConnector(connector, {
          name: row.name,
          syncIntervalSeconds: row.sync_interval_seconds || 300,
          autoSync: parsedConfig.autoSync === true || parsedConfig.watch === true,
          config: { ...parsedConfig, type: connectorType },
        })
      } catch (err) {
        log.fail(`Failed to restore connector ${row.name}: ${(err as Error).message}`)
      }
    }

    // Shutdown function
    const shutdown = async (): Promise<void> => {
      clearInterval(purgeTimer)
      webhookDispatcher?.destroy()
      for (const manager of connectorManagers.values()) {
        await manager.shutdown()
      }
      for (const connector of extraConnectorInstances) {
        await connector.teardown?.()
      }
      await registry.teardownAll()
      eventBus.removeAllListeners()
      await vectorDbRef.close()
      dbRef.close()
    }

    const forWorkspace = (workspaceId?: string): WorkspaceServices => {
      const resolvedWorkspaceId = workspaceId || defaultWorkspace.id
      return {
        workspaceId: resolvedWorkspaceId,
        store: getStoreForWorkspace(resolvedWorkspaceId),
        pipeline: getPipelineForWorkspace(resolvedWorkspaceId),
        ragEngine: getRAGEngineForWorkspace(resolvedWorkspaceId),
        conversationManager: getConversationManagerForWorkspace(resolvedWorkspaceId),
        connectorManager: getConnectorManagerForWorkspace(resolvedWorkspaceId),
        tagManager: getTagManagerForWorkspace(resolvedWorkspaceId),
        collectionManager: getCollectionManagerForWorkspace(resolvedWorkspaceId),
      }
    }

    // Non-blocking update check — fires and forgets so it never delays startup.
    checkForUpdates(SERVER_VERSION).then(info => {
      if (info.updateAvailable) {
        log.info(`Update available: v${info.latestVersion} (current: v${info.currentVersion}). Run: npm install -g opendocuments@latest`)
      }
    }).catch(() => {})

    return {
      config,
      db: sqliteDb,
      vectorDb: lanceDb,
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
      readiness,
      createConnector: (connectorConfig) => createConnector(connectorConfig, dataDir),
      pluginManifestPath,
      forWorkspace,
      shutdown,
    }
  } catch (err) {
    // Cleanup partially initialized resources
    if (vectorDb) await vectorDb.close().catch(() => {})
    if (db) db.close()
    throw err
  }
}
