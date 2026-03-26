import { randomUUID } from 'node:crypto'
import type { DB } from '../storage/db.js'

export type AuditEventType = 'cloud:data-sent' | 'document:accessed' | 'auth:login' | 'auth:failed' | 'config:changed' | 'plugin:installed' | 'document:deleted' | 'connector:synced'

export interface AuditEntry {
  id: string
  workspaceId?: string
  userId?: string
  eventType: AuditEventType
  details?: Record<string, unknown>
  ipAddress?: string
  createdAt: string
}

export class AuditLogger {
  private enabled: boolean

  constructor(private db: DB, config?: { enabled: boolean }) {
    this.enabled = config?.enabled ?? false
  }

  log(event: {
    eventType: AuditEventType
    workspaceId?: string
    userId?: string
    details?: Record<string, unknown>
    ipAddress?: string
  }): void {
    if (!this.enabled) return

    const id = randomUUID()
    const now = new Date().toISOString()

    try {
      this.db.run(
        `INSERT INTO audit_logs (id, workspace_id, user_id, event_type, details, ip_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, event.workspaceId || null, event.userId || null, event.eventType,
         event.details ? JSON.stringify(event.details) : null,
         event.ipAddress || null, now]
      )
    } catch {} // Never fail the main operation because of audit logging
  }

  query(opts?: {
    eventType?: string
    workspaceId?: string
    limit?: number
    offset?: number
  }): AuditEntry[] {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1'
    const params: unknown[] = []

    if (opts?.eventType) {
      sql += ' AND event_type = ?'
      params.push(opts.eventType)
    }
    if (opts?.workspaceId) {
      sql += ' AND workspace_id = ?'
      params.push(opts.workspaceId)
    }

    sql += ' ORDER BY created_at DESC'

    if (opts?.limit) {
      sql += ' LIMIT ?'
      params.push(opts.limit)
    }
    if (opts?.offset) {
      sql += ' OFFSET ?'
      params.push(opts.offset)
    }

    return this.db.all<any>(sql, params).map(row => ({
      id: row.id,
      workspaceId: row.workspace_id,
      userId: row.user_id,
      eventType: row.event_type,
      details: row.details ? JSON.parse(row.details) : undefined,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
    }))
  }
}
