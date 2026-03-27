import type { DB } from '../storage/db.js'

export type RelationType = 'next' | 'parent' | 'references' | 'same_function'

export interface ChunkRelation {
  sourceChunkId: string
  targetChunkId: string
  relationType: RelationType
}

export class ChunkRelationManager {
  constructor(private db: DB) {}

  addRelation(source: string, target: string, type: RelationType): void {
    this.db.run(
      'INSERT OR IGNORE INTO chunk_relations (source_chunk_id, target_chunk_id, relation_type) VALUES (?, ?, ?)',
      [source, target, type]
    )
  }

  getRelated(chunkId: string, type?: RelationType): ChunkRelation[] {
    let sql = 'SELECT * FROM chunk_relations WHERE (source_chunk_id = ? OR target_chunk_id = ?)'
    const params: unknown[] = [chunkId, chunkId]
    if (type) { sql += ' AND relation_type = ?'; params.push(type) }

    return this.db.all<any>(sql, params).map(r => ({
      sourceChunkId: r.source_chunk_id,
      targetChunkId: r.target_chunk_id,
      relationType: r.relation_type,
    }))
  }

  removeRelationsForDocument(documentId: string): void {
    this.db.run(
      `DELETE FROM chunk_relations WHERE source_chunk_id LIKE ? OR target_chunk_id LIKE ?`,
      [`${documentId}_chunk_%`, `${documentId}_chunk_%`]
    )
  }
}
