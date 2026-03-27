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
    this.db.run('DELETE FROM tags WHERE id = ?', [id])
  }

  tagDocument(documentId: string, tagId: string): void {
    this.db.run(
      'INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)',
      [documentId, tagId]
    )
  }

  untagDocument(documentId: string, tagId: string): void {
    this.db.run('DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?', [documentId, tagId])
  }

  getDocumentTags(documentId: string): Tag[] {
    return this.db.all<any>(
      `SELECT t.* FROM tags t JOIN document_tags dt ON t.id = dt.tag_id WHERE dt.document_id = ?`,
      [documentId]
    ).map(r => ({ id: r.id, workspaceId: r.workspace_id, name: r.name, color: r.color }))
  }

  getDocumentsByTag(tagId: string): string[] {
    return this.db.all<any>(
      'SELECT document_id FROM document_tags WHERE tag_id = ?', [tagId]
    ).map(r => r.document_id)
  }
}
