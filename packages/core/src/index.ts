// @opendocs/core - public API
// Will be populated as modules are implemented

export const VERSION = '0.1.0'

export { log } from './utils/logger.js'
export { sha256 } from './utils/hash.js'
export { EventBus } from './events/bus.js'
export { PluginRegistry } from './plugin/registry.js'

export type {
  PluginType,
  PipelineStage,
  HealthStatus,
  PluginMetrics,
  PluginPermissions,
  PluginContext,
  OpenDocsPlugin,
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
