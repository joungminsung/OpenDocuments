// @opendocuments/core - public API
// Will be populated as modules are implemented

export const VERSION = '0.1.0'

export { log } from './utils/logger.js'
export { estimateTokens } from './utils/tokenizer.js'
export { sha256 } from './utils/hash.js'
export { discoverFiles } from './utils/file-discovery.js'
export { fetchWithTimeout } from './utils/fetch.js'
export { FileWatcher, type FileChange } from './utils/file-watcher.js'
export { EventBus, type OpenDocumentsEventMap, type EventName } from './events/bus.js'
export { PluginRegistry } from './plugin/registry.js'
export { checkCompatibility, type CompatibilityResult } from './plugin/capability.js'

export { configSchema, type OpenDocumentsConfig } from './config/schema.js'
export { loadConfig, validateConfig, defineConfig } from './config/loader.js'
export { buildConfigFromEnv } from './config/env-loader.js'
export { DEFAULT_CONFIG } from './config/defaults.js'

export type { DB, Row, DBFactory } from './storage/db.js'
export { createSQLiteDB } from './storage/sqlite.js'
export { runMigrations } from './storage/migrations/runner.js'

export type { VectorDB, VectorDocument, VectorSearchResult, VectorSearchOpts } from './storage/vector-db.js'
export { createLanceDB } from './storage/lancedb.js'

export { WorkspaceManager, type Workspace } from './workspace/manager.js'

export { loadPlugin, loadPlugins, isValidPlugin } from './plugin/loader.js'
export { validatePluginPermissions, enforceNetworkPermission, enforceFilesystemPermission, type ResolvedPermissions } from './plugin/sandbox.js'

export { chunkText, semanticChunkText, type ChunkOptions, type TextChunk } from './ingest/chunker.js'
export { MiddlewareRunner } from './ingest/middleware.js'
export { DocumentStore, type CreateDocumentInput, type StoredChunk, type SearchResult } from './ingest/document-store.js'

export { IngestPipeline, type IngestInput, type IngestResult, type IngestPipelineOptions } from './ingest/pipeline.js'

export { ConnectorManager, type ConnectorSyncResult } from './connector/manager.js'

export { MarkdownParser } from './parsers/markdown.js'
export { PlainTextParser } from './parsers/plaintext.js'
export { StructuredDataParser } from './parsers/structured.js'
export { ArchiveParser } from './parsers/archive.js'

export { getProfileConfig, type RAGProfileConfig } from './rag/profiles.js'
export { classifyIntent, type QueryIntent } from './rag/intent.js'
export { calculateConfidence, type ConfidenceInput, type ConfidenceResult } from './rag/confidence.js'
export { Retriever, type RetrieveOptions } from './rag/retriever.js'

export { generateAnswer, buildPrompt, type GenerateInput } from './rag/generator.js'
export { routeQuery, type QueryRoute } from './rag/router.js'
export { RAGEngine, type QueryInput, type QueryResult, type RAGEngineOptions } from './rag/engine.js'
export { decomposeQuery, type DecomposedQuery } from './rag/decomposer.js'
export { expandQuery, reciprocalRankFusion } from './rag/cross-lingual.js'
export { rerankResults } from './rag/reranker.js'
export { checkGrounding, checkSemanticGrounding, type GroundingResult } from './rag/grounding.js'
export { crossWorkspaceSearch } from './rag/cross-workspace.js'
export { RAGCache, createQueryCache, createEmbeddingCache, createWebSearchCache } from './rag/cache.js'
export { fitToContextWindow, type ContextWindowConfig } from './rag/context-window.js'

export { ConversationManager, type Conversation, type Message } from './conversation/manager.js'

export { DocumentVersionManager, type DocumentVersion } from './document/version-manager.js'
export { TagManager, type Tag } from './document/tag-manager.js'
export { CollectionManager, type Collection } from './document/collection-manager.js'
export { ChunkRelationManager, type ChunkRelation, type RelationType } from './document/chunk-relations.js'

export { APIKeyManager, generateAPIKey, type APIKeyRecord, type APIKeyScope, type UserRole, type CreateKeyInput, type ValidatedKey } from './auth/api-key.js'
export { OAuthProvider, type OAuthConfig, type OAuthUser } from './auth/oauth.js'

export { PIIRedactor, type RedactorConfig } from './security/redactor.js'
export { AuditLogger, type AuditEventType, type AuditEntry } from './security/audit.js'
export { SecurityAlertManager, type AlertRule, type Alert } from './security/alerts.js'

export { TelemetryCollector, type TelemetryEvent } from './telemetry/collector.js'

export type {
  PluginType,
  PipelineStage,
  HealthStatus,
  PluginMetrics,
  PluginPermissions,
  PluginContext,
  OpenDocumentsPlugin,
  ConnectorPlugin,
  ParserPlugin,
  ModelPlugin,
  MiddlewarePlugin,
  AnyPlugin,
  DiscoveredDocument,
  DocumentRef,
  RawDocument,
  ChangeEvent,
  Disposable,
  AuthResult,
  ParsedChunk,
  GenerateOpts,
  EmbeddingResult,
  RerankResult,
} from './plugin/interfaces.js'
