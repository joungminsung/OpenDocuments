import type { ConnectorPlugin, DiscoveredDocument, PluginContext } from '../plugin/interfaces.js'
import type { IngestPipeline } from '../ingest/pipeline.js'
import type { DocumentStore } from '../ingest/document-store.js'
import type { EventBus } from '../events/bus.js'
import type { DB } from '../storage/db.js'
import { sha256 } from '../utils/hash.js'
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
    private workspaceId: string = 'default'
  ) {}

  /**
   * Register a connector and optionally create a DB record for it.
   */
  registerConnector(plugin: ConnectorPlugin, config: {
    name?: string
    syncIntervalSeconds?: number
  } = {}): string {
    const connectorId = randomUUID()
    const name = config.name || plugin.name

    // Save connector record to DB
    this.db.run(
      `INSERT INTO connectors (id, workspace_id, name, type, config, sync_interval_seconds, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [connectorId, this.workspaceId, name, plugin.name, '{}', config.syncIntervalSeconds || 300, new Date().toISOString()]
    )

    this.connectors.set(plugin.name, { plugin, connectorId })
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
      for await (const discovered of plugin.discover()) {
        result.documentsDiscovered++

        try {
          // Check if document already exists with same content hash
          const existing = this.store.getDocumentBySourcePath(discovered.sourcePath)
          if (existing && discovered.contentHash && !this.store.hasContentChanged(existing.id, discovered.contentHash)) {
            result.documentsSkipped++
            continue
          }

          // Fetch full content
          const raw = await plugin.fetch({ sourceId: discovered.sourceId, sourcePath: discovered.sourcePath })
          const content = typeof raw.content === 'string' ? raw.content : raw.content

          // Determine file type from path or mime type
          const fileType = extname(discovered.sourcePath) || '.md'

          // Ingest through pipeline
          const ingestResult = await this.pipeline.ingest({
            title: discovered.title,
            content,
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
  listConnectors(): { name: string; connectorId: string; status: string; lastSyncedAt: string | null }[] {
    return Array.from(this.connectors.entries()).map(([name, entry]) => {
      const row = this.db.get<any>('SELECT status, last_synced_at FROM connectors WHERE id = ?', [entry.connectorId])
      return {
        name,
        connectorId: entry.connectorId,
        status: row?.status || 'unknown',
        lastSyncedAt: row?.last_synced_at || null,
      }
    })
  }
}
