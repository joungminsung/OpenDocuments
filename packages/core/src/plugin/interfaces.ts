// --- Plugin Types ---

export type PluginType = 'connector' | 'parser' | 'model' | 'middleware'

export type PipelineStage =
  | 'before:discover' | 'after:discover'
  | 'before:fetch' | 'after:fetch'
  | 'before:parse' | 'after:parse'
  | 'before:chunk' | 'after:chunk'
  | 'before:retrieve' | 'after:retrieve'
  | 'before:rerank' | 'after:rerank'
  | 'before:generate' | 'after:generate'
  | 'before:query' | 'after:query'

// --- Health & Metrics ---

export interface HealthStatus {
  healthy: boolean
  message?: string
  details?: Record<string, unknown>
}

export interface PluginMetrics {
  [key: string]: string | number | boolean
}

// --- Permissions ---

export interface PluginPermissions {
  network?: boolean | string[]
  filesystem?: boolean | string[]
  env?: string[]
  events?: string[]
}

// --- Plugin Context (passed to setup) ---

export interface PluginContext {
  config: Record<string, unknown>
  dataDir: string
  log: {
    ok: (msg: string) => void
    fail: (msg: string) => void
    info: (msg: string) => void
    wait: (msg: string) => void
  }
}

// --- Base Plugin ---

export interface OpenDocsPlugin {
  name: string
  type: PluginType
  version: string
  coreVersion: string
  dependencies?: string[]
  conflicts?: string[]
  configSchema?: Record<string, unknown>
  permissions?: PluginPermissions

  setup(ctx: PluginContext): Promise<void>
  teardown?(): Promise<void>
  healthCheck?(): Promise<HealthStatus>
  metrics?(): Promise<PluginMetrics>

  migrations?: {
    from: string
    migrate: (oldConfig: Record<string, unknown>) => Record<string, unknown>
  }[]
}

// --- Connector Plugin ---

export interface DiscoveredDocument {
  sourceId: string
  title: string
  sourcePath: string
  contentHash?: string
  metadata?: Record<string, unknown>
}

export interface DocumentRef {
  sourceId: string
  sourcePath: string
}

export interface RawDocument {
  sourceId: string
  title: string
  content: Buffer | string
  mimeType?: string
  metadata?: Record<string, unknown>
}

export interface ChangeEvent {
  type: 'created' | 'updated' | 'deleted'
  document: DiscoveredDocument
}

export interface Disposable {
  dispose(): Promise<void>
}

export interface AuthResult {
  success: boolean
  message?: string
}

export interface ConnectorPlugin extends OpenDocsPlugin {
  type: 'connector'
  discover(): AsyncIterable<DiscoveredDocument>
  fetch(docRef: DocumentRef): Promise<RawDocument>
  watch?(onChange: (event: ChangeEvent) => void): Promise<Disposable>
  auth?(): Promise<AuthResult>
}

// --- Parser Plugin ---

export interface ParsedChunk {
  content: string
  chunkType: 'semantic' | 'code-ast' | 'table' | 'api-endpoint' | 'slide' | 'multimedia'
  language?: string
  headingHierarchy?: string[]
  codeSymbols?: string[]
  codeImports?: string[]
  page?: number
  timestamp?: string
  metadata?: Record<string, unknown>
}

export interface ParserPlugin extends OpenDocsPlugin {
  type: 'parser'
  supportedTypes: string[]
  multimodal?: boolean
  parse(raw: RawDocument): AsyncIterable<ParsedChunk>
}

// --- Model Plugin ---

export interface GenerateOpts {
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  stop?: string[]
}

export interface EmbeddingResult {
  dense: number[][]
  sparse?: { indices: number[]; values: number[] }[]
}

export interface RerankResult {
  scores: number[]
  indices: number[]
}

export interface ModelPlugin extends OpenDocsPlugin {
  type: 'model'
  capabilities: {
    llm?: boolean
    embedding?: boolean
    reranker?: boolean
    vision?: boolean
  }
  generate?(prompt: string, opts?: GenerateOpts): AsyncIterable<string>
  embed?(texts: string[]): Promise<EmbeddingResult>
  rerank?(query: string, docs: string[]): Promise<RerankResult>
  describeImage?(image: Buffer): Promise<string>
}

// --- Middleware Plugin ---

export interface MiddlewarePlugin extends OpenDocsPlugin {
  type: 'middleware'
  hooks: {
    stage: PipelineStage
    handler: (data: unknown) => Promise<unknown>
  }[]
}

// --- Union type ---

export type AnyPlugin = ConnectorPlugin | ParserPlugin | ModelPlugin | MiddlewarePlugin
