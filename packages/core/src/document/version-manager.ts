import { randomUUID } from 'node:crypto'
import type { DB } from '../storage/db.js'

export interface DocumentVersion {
  id: string
  documentId: string
  version: number
  contentHash: string
  chunkCount: number | null
  changes: Record<string, unknown> | null
  createdAt: string
}

export class DocumentVersionManager {
  constructor(private db: DB) {}

  recordVersion(documentId: string, contentHash: string, chunkCount: number, changes?: Record<string, unknown>): DocumentVersion {
    const currentMax = this.db.get<any>(
      'SELECT MAX(version) as maxV FROM document_versions WHERE document_id = ?', [documentId]
    )
    const version = (currentMax?.maxV || 0) + 1
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.run(
      `INSERT INTO document_versions (id, document_id, version, content_hash, chunk_count, changes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, documentId, version, contentHash, chunkCount, changes ? JSON.stringify(changes) : null, now]
    )

    return { id, documentId, version, contentHash, chunkCount, changes: changes || null, createdAt: now }
  }

  listVersions(documentId: string): DocumentVersion[] {
    return this.db.all<any>(
      'SELECT * FROM document_versions WHERE document_id = ? ORDER BY version DESC', [documentId]
    ).map(row => ({
      id: row.id, documentId: row.document_id, version: row.version,
      contentHash: row.content_hash, chunkCount: row.chunk_count,
      changes: row.changes ? JSON.parse(row.changes) : null, createdAt: row.created_at,
    }))
  }

  getVersion(documentId: string, version: number): DocumentVersion | undefined {
    const row = this.db.get<any>(
      'SELECT * FROM document_versions WHERE document_id = ? AND version = ?', [documentId, version]
    )
    if (!row) return undefined
    return {
      id: row.id, documentId: row.document_id, version: row.version,
      contentHash: row.content_hash, chunkCount: row.chunk_count,
      changes: row.changes ? JSON.parse(row.changes) : null, createdAt: row.created_at,
    }
  }
}
