import { randomUUID } from 'node:crypto'
import type { DB } from '../storage/db.js'

export interface Collection {
  id: string
  workspaceId: string
  name: string
  description: string | null
  autoRules: Record<string, unknown> | null
  createdAt: string
}

export class CollectionManager {
  constructor(private db: DB, private workspaceId: string) {}

  create(name: string, description?: string, autoRules?: Record<string, unknown>): Collection {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      'INSERT INTO collections (id, workspace_id, name, description, auto_rules, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, this.workspaceId, name, description || null, autoRules ? JSON.stringify(autoRules) : null, now]
    )
    return { id, workspaceId: this.workspaceId, name, description: description || null, autoRules: autoRules || null, createdAt: now }
  }

  list(): Collection[] {
    return this.db.all<any>(
      'SELECT * FROM collections WHERE workspace_id = ? ORDER BY name', [this.workspaceId]
    ).map(r => ({
      id: r.id, workspaceId: r.workspace_id, name: r.name,
      description: r.description, autoRules: r.auto_rules ? JSON.parse(r.auto_rules) : null,
      createdAt: r.created_at,
    }))
  }

  delete(id: string): void {
    this.db.run('DELETE FROM collections WHERE id = ?', [id])
  }

  addDocument(collectionId: string, documentId: string): void {
    this.db.run(
      'INSERT OR IGNORE INTO collection_documents (collection_id, document_id) VALUES (?, ?)',
      [collectionId, documentId]
    )
  }

  removeDocument(collectionId: string, documentId: string): void {
    this.db.run('DELETE FROM collection_documents WHERE collection_id = ? AND document_id = ?', [collectionId, documentId])
  }

  getDocuments(collectionId: string): string[] {
    return this.db.all<any>(
      'SELECT document_id FROM collection_documents WHERE collection_id = ?', [collectionId]
    ).map(r => r.document_id)
  }
}
