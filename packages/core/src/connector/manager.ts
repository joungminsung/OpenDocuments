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

export class ConnectorManager {
  private connectors = new Map<string, { plugin: ConnectorPlugin; connectorId: string }>()
  private syncTimers = new Map<string, ReturnType<typeof setInterval>>()

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
    const serializedConfig = JSON.stringify(config.config || {})
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

    this.connectors.set(plugin.name, { plugin, connectorId })
    if (config.autoSync) {
      this.startPeriodicSync(plugin.name, config.syncIntervalSeconds || 300)
    }
    return connectorId
  }

  /**
   * Sync a single connector: discover docs, fetch new/changed, ingest.
   */
  async syncConnector(pluginName: string): Promise<ConnectorSyncResult> {
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
          // Check if document already exists with same content hash
          const existing = this.store.getDocumentBySourcePath(discovered.sourcePath)
          if (existing && discovered.contentHash && !this.store.hasContentChanged(existing.id, discovered.contentHash)) {
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

    // Update connector status
    this.db.run(
      'UPDATE connectors SET last_synced_at = ?, status = ? WHERE id = ?',
      [new Date().toISOString(), 'active', connectorId]
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

  /**
   * List registered connectors with their DB status.
   */
  listConnectors(): { name: string; connectorId: string; type: string; status: string; lastSyncedAt: string | null; syncIntervalSeconds: number | null; repo?: string }[] {
    return Array.from(this.connectors.entries()).map(([name, entry]) => {
      const row = this.db.get<any>('SELECT name, type, config, status, last_synced_at, sync_interval_seconds FROM connectors WHERE id = ?', [entry.connectorId])
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
        repo,
      }
    })
  }
}
