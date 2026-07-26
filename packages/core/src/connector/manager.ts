import type { ConnectorPlugin, DiscoveredDocument, PluginContext } from '../plugin/interfaces.js'
import type { IngestPipeline } from '../ingest/pipeline.js'
import type { DocumentStore } from '../ingest/document-store.js'
import type { EventBus } from '../events/bus.js'
import type { DB } from '../storage/db.js'
import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'

export interface ConnectorSyncResult {
  connectorName: string
  documentsDiscovered: number
  documentsIndexed: number
  documentsSkipped: number
  errors: string[]
}

interface ConnectorRow extends Record<string, unknown> {
  name: string
  type: string
  config: string
  status: string
  last_synced_at: string | null
  sync_interval_seconds: number | null
  error_message: string | null
}

const CONNECTOR_SECRET_FIELDS = new Set([
  'token',
  'accesstoken',
  'apikey',
  'secretaccesskey',
  'sessiontoken',
  'serviceaccountkey',
  'password',
  'clientsecret',
  'authorization',
  'cookie',
  'credentials',
  'headers',
  'privatekey',
])

function isSecretField(key: string): boolean {
  const normalized = key.replace(/[-_]/g, '').toLowerCase()
  return CONNECTOR_SECRET_FIELDS.has(normalized)
    || normalized.endsWith('token')
    || normalized.endsWith('secret')
    || normalized.endsWith('password')
}

function sanitizePersistedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePersistedValue)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSecretField(key))
      .map(([key, nested]) => [key, sanitizePersistedValue(nested)])
  )
}

function configForPersistence(config: Record<string, unknown>): Record<string, unknown> {
  return sanitizePersistedValue(config) as Record<string, unknown>
}

export class ConnectorManager {
  private connectors = new Map<string, { plugin: ConnectorPlugin; connectorId: string }>()
  private syncTimers = new Map<string, ReturnType<typeof setInterval>>()
  private syncsInFlight = new Map<string, Promise<ConnectorSyncResult>>()
  private ownedConnectors = new Set<ConnectorPlugin>()

  constructor(
    private pipeline: IngestPipeline,
    private store: DocumentStore,
    private eventBus: EventBus,
    private db: DB,
    private workspaceId: string = 'default',
    private syncConcurrency: number = 4
  ) {}

  /**
   * Register a connector and optionally create a DB record for it.
   */
  registerConnector(plugin: ConnectorPlugin, config: {
    name?: string
    syncIntervalSeconds?: number
    autoSync?: boolean
    config?: Record<string, unknown>
  } = {}): string {
    const name = config.name || plugin.name
    const serializedConfig = JSON.stringify(configForPersistence(config.config || {}))
    const existing = this.db.get<{ id: string }>(
      `SELECT id FROM connectors
       WHERE workspace_id = ? AND name = ? AND type = ? AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [this.workspaceId, name, plugin.name]
    )

    const connectorId = existing?.id || randomUUID()

    if (existing) {
      this.db.run(
        `UPDATE connectors
         SET config = ?, sync_interval_seconds = ?, status = 'active', error_message = NULL
         WHERE id = ?`,
        [serializedConfig, config.syncIntervalSeconds || 300, connectorId]
      )
    } else {
      this.db.run(
        `INSERT INTO connectors (id, workspace_id, name, type, config, sync_interval_seconds, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
        [connectorId, this.workspaceId, name, plugin.name, serializedConfig, config.syncIntervalSeconds || 300, new Date().toISOString()]
      )
    }

    this.connectors.set(name, { plugin, connectorId })
    if (config.autoSync) {
      this.startPeriodicSync(name, config.syncIntervalSeconds || 300)
    }
    return connectorId
  }

  /**
   * Register a connector whose lifecycle is owned by this manager.
   * Runtime-created connector instances are torn down when replaced or when
   * the manager shuts down.
   */
  async registerOwnedConnector(plugin: ConnectorPlugin, config: {
    name?: string
    syncIntervalSeconds?: number
    autoSync?: boolean
    config?: Record<string, unknown>
  } = {}): Promise<string> {
    const name = config.name || plugin.name
    const previous = this.connectors.get(name)?.plugin
    if (previous && this.ownedConnectors.delete(previous)) {
      await previous.teardown?.()
    }
    const connectorId = this.registerConnector(plugin, config)
    this.ownedConnectors.add(plugin)
    return connectorId
  }

  /**
   * Sync a single connector: discover docs, fetch new/changed, ingest.
   */
  async syncConnector(pluginName: string): Promise<ConnectorSyncResult> {
    const running = this.syncsInFlight.get(pluginName)
    if (running) return running

    const operation = this.performSync(pluginName).finally(() => {
      this.syncsInFlight.delete(pluginName)
    })
    this.syncsInFlight.set(pluginName, operation)
    return operation
  }

  private async performSync(pluginName: string): Promise<ConnectorSyncResult> {
    const entry = this.connectors.get(pluginName)
    if (!entry) throw new Error(`Connector not found: ${pluginName}`)

    const { plugin, connectorId } = entry
    const result: ConnectorSyncResult = {
      connectorName: pluginName,
      documentsDiscovered: 0,
      documentsIndexed: 0,
      documentsSkipped: 0,
      errors: [],
    }

    this.eventBus.emit('connector:sync:started', { connectorId })

    try {
      const concurrency = Math.max(1, this.syncConcurrency)
      const inFlight = new Set<Promise<void>>()
      const syncOne = async (discovered: DiscoveredDocument): Promise<void> => {
        result.documentsDiscovered++
        this.eventBus.emit('document:discovered', { documentId: discovered.sourceId, source: plugin.name })

        try {
          // Provider revisions are not content hashes. Keep them in a separate
          // column so Git blob SHA-1, Drive MD5, and timestamps can be compared
          // without conflicting with the pipeline's SHA-256 content hash.
          const existing = this.store.getDocumentBySourcePath(discovered.sourcePath)
          if (existing && discovered.contentHash && !this.store.hasSourceVersionChanged(existing.id, discovered.contentHash)) {
            result.documentsSkipped++
            return
          }

          // Fetch full content
          const raw = await plugin.fetch({ sourceId: discovered.sourceId, sourcePath: discovered.sourcePath })

          // Determine file type from path or mime type
          const fileType = extname(discovered.sourcePath) || '.md'

          // Ingest through pipeline
          const ingestResult = await this.pipeline.ingest({
            title: discovered.title,
            content: raw.content,
            sourceType: plugin.name,
            sourcePath: discovered.sourcePath,
            fileType,
            connectorId,
            sourceVersion: discovered.contentHash,
          })

          if (ingestResult.status === 'indexed') result.documentsIndexed++
          else if (ingestResult.status === 'skipped') result.documentsSkipped++
          else result.errors.push(`${discovered.title}: ${ingestResult.status}`)
        } catch (err) {
          result.errors.push(`${discovered.title}: ${(err as Error).message}`)
        }
      }

      for await (const discovered of plugin.discover()) {
        const task = syncOne(discovered).finally(() => {
          inFlight.delete(task)
        })
        inFlight.add(task)
        if (inFlight.size >= concurrency) {
          await Promise.race(inFlight)
        }
      }
      await Promise.all(inFlight)
    } catch (err) {
      result.errors.push(`Discovery failed: ${(err as Error).message}`)
    }

    const status = result.errors.length > 0 ? 'error' : 'active'
    const errorMessage = result.errors.length > 0
      ? result.errors.slice(0, 5).join('; ')
      : null
    this.db.run(
      'UPDATE connectors SET last_synced_at = ?, status = ?, error_message = ? WHERE id = ?',
      [new Date().toISOString(), status, errorMessage, connectorId]
    )

    this.eventBus.emit('connector:sync:completed', {
      connectorId,
      documents: result.documentsIndexed,
    })

    return result
  }

  /**
   * Sync all registered connectors.
   */
  async syncAll(): Promise<ConnectorSyncResult[]> {
    const results: ConnectorSyncResult[] = []
    for (const [name] of this.connectors) {
      results.push(await this.syncConnector(name))
    }
    return results
  }

  /**
   * Start periodic sync for a connector.
   */
  startPeriodicSync(pluginName: string, intervalSeconds: number): void {
    this.stopPeriodicSync(pluginName)
    const timer = setInterval(() => {
      this.syncConnector(pluginName).catch(console.error)
    }, intervalSeconds * 1000)
    this.syncTimers.set(pluginName, timer)
  }

  /**
   * Stop periodic sync for a connector.
   */
  stopPeriodicSync(pluginName: string): void {
    const timer = this.syncTimers.get(pluginName)
    if (timer) {
      clearInterval(timer)
      this.syncTimers.delete(pluginName)
    }
  }

  /**
   * Stop all periodic syncs.
   */
  stopAll(): void {
    for (const [name] of this.syncTimers) {
      this.stopPeriodicSync(name)
    }
  }

  /** Stop timers and tear down runtime-owned connector instances. */
  async shutdown(): Promise<void> {
    this.stopAll()
    for (const connector of this.ownedConnectors) {
      await connector.teardown?.()
    }
    this.ownedConnectors.clear()
  }

  /**
   * List registered connectors with their DB status.
   */
  listConnectors(): { name: string; connectorId: string; type: string; status: string; lastSyncedAt: string | null; syncIntervalSeconds: number | null; errorMessage?: string; repo?: string }[] {
    return Array.from(this.connectors.entries()).map(([name, entry]) => {
      const row = this.db.get<ConnectorRow>(
        'SELECT name, type, config, status, last_synced_at, sync_interval_seconds, error_message FROM connectors WHERE id = ?',
        [entry.connectorId]
      )
      let repo: string | undefined
      try {
        const parsed = JSON.parse(row?.config || '{}') as { repo?: unknown }
        if (typeof parsed.repo === 'string') repo = parsed.repo
      } catch {}
      return {
        name: row?.name || name,
        connectorId: entry.connectorId,
        type: row?.type || name,
        status: row?.status || 'unknown',
        lastSyncedAt: row?.last_synced_at || null,
        syncIntervalSeconds: row?.sync_interval_seconds || null,
        errorMessage: row?.error_message || undefined,
        repo,
      }
    })
  }
}
