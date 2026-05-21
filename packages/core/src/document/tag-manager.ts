import { randomUUID } from 'node:crypto'
import type { DB } from '../storage/db.js'

export interface Tag {
  id: string
  workspaceId: string
  name: string
  color: string | null
}

export class TagManager {
  constructor(private db: DB, private workspaceId: string) {}

  create(name: string, color?: string): Tag {
    const id = randomUUID()
    this.db.run(
      'INSERT INTO tags (id, workspace_id, name, color) VALUES (?, ?, ?, ?)',
      [id, this.workspaceId, name, color || null]
    )
    return { id, workspaceId: this.workspaceId, name, color: color || null }
  }

  list(): Tag[] {
    return this.db.all<any>(
      'SELECT * FROM tags WHERE workspace_id = ? ORDER BY name', [this.workspaceId]
    ).map(r => ({ id: r.id, workspaceId: r.workspace_id, name: r.name, color: r.color }))
  }

  delete(id: string): void {
    this.db.run('DELETE FROM tags WHERE id = ? AND workspace_id = ?', [id, this.workspaceId])
  }

  tagDocument(documentId: string, tagId: string): void {
    this.db.run(
      `INSERT OR IGNORE INTO document_tags (document_id, tag_id)
       SELECT d.id, t.id
       FROM documents d
       JOIN tags t ON t.id = ?
       WHERE d.id = ? AND d.workspace_id = ? AND t.workspace_id = ?`,
      [tagId, documentId, this.workspaceId, this.workspaceId]
    )
  }

  untagDocument(documentId: string, tagId: string): void {
    this.db.run(
      `DELETE FROM document_tags
       WHERE document_id = ? AND tag_id = ?
       AND EXISTS (SELECT 1 FROM documents WHERE id = ? AND workspace_id = ?)
       AND EXISTS (SELECT 1 FROM tags WHERE id = ? AND workspace_id = ?)`,
      [documentId, tagId, documentId, this.workspaceId, tagId, this.workspaceId]
    )
  }

  getDocumentTags(documentId: string): Tag[] {
    return this.db.all<any>(
      `SELECT t.* FROM tags t
       JOIN document_tags dt ON t.id = dt.tag_id
       JOIN documents d ON d.id = dt.document_id
       WHERE dt.document_id = ? AND t.workspace_id = ? AND d.workspace_id = ?`,
      [documentId, this.workspaceId, this.workspaceId]
    ).map(r => ({ id: r.id, workspaceId: r.workspace_id, name: r.name, color: r.color }))
  }

  getDocumentsByTag(tagId: string): string[] {
    return this.db.all<any>(
      `SELECT dt.document_id FROM document_tags dt
       JOIN tags t ON t.id = dt.tag_id
       JOIN documents d ON d.id = dt.document_id
       WHERE dt.tag_id = ? AND t.workspace_id = ? AND d.workspace_id = ?`,
      [tagId, this.workspaceId, this.workspaceId]
    ).map(r => r.document_id)
  }
}
