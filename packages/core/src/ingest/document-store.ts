import { randomUUID } from 'node:crypto'
import type { DB } from '../storage/db.js'
import type { VectorDB } from '../storage/vector-db.js'

const COLLECTION = 'opendocs_chunks'

export interface CreateDocumentInput {
  title: string
  sourceType: string
  sourcePath: string
  fileType?: string
  fileSizeBytes?: number
  connectorId?: string
}

export interface StoredChunk {
  content: string
  embedding: number[]
  chunkType: string
  position: number
  tokenCount: number
  headingHierarchy: string[]
  language?: string
  codeSymbols?: string[]
}

export interface SearchResult {
  chunkId: string
  content: string
  score: number
  documentId: string
  chunkType: string
  headingHierarchy: string[]
  sourcePath: string
  sourceType: string
}

interface DocumentRow {
  id: string
  title: string
  source_type: string
  source_path: string
  file_type: string | null
  chunk_count: number
  status: string
  content_hash: string | null
  [key: string]: unknown
}

export class DocumentStore {
  constructor(
    private db: DB,
    private vectorDb: VectorDB,
    private workspaceId: string
  ) {}

  async initialize(dimensions: number): Promise<void> {
    await this.vectorDb.ensureCollection(COLLECTION, dimensions)
    // Ensure the workspace row exists so FK constraints are satisfied
    const now = new Date().toISOString()
    this.db.run(
      `INSERT OR IGNORE INTO workspaces (id, name, mode, settings, created_at) VALUES (?, ?, 'personal', '{}', ?)`,
      [this.workspaceId, this.workspaceId, now]
    )
  }

  createDocument(input: CreateDocumentInput): { id: string; status: string } {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.run(
      `INSERT INTO documents (id, workspace_id, title, source_type, source_path, file_type, file_size_bytes, connector_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, this.workspaceId, input.title, input.sourceType, input.sourcePath,
       input.fileType || null, input.fileSizeBytes || null, input.connectorId || null, now, now]
    )
    return { id, status: 'pending' }
  }

  getDocument(id: string): DocumentRow | undefined {
    return this.db.get<DocumentRow>(
      'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL', [id]
    )
  }

  listDocuments(): DocumentRow[] {
    return this.db.all<DocumentRow>(
      'SELECT * FROM documents WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [this.workspaceId]
    )
  }

  getDocumentBySourcePath(sourcePath: string): DocumentRow | undefined {
    return this.db.get<DocumentRow>(
      'SELECT * FROM documents WHERE workspace_id = ? AND source_path = ? AND deleted_at IS NULL',
      [this.workspaceId, sourcePath]
    )
  }

  async storeChunks(documentId: string, chunks: StoredChunk[]): Promise<void> {
    const vectorDocs = chunks.map((chunk, i) => ({
      id: `${documentId}_chunk_${i}`,
      content: chunk.content,
      embedding: chunk.embedding,
      metadata: {
        document_id: documentId,
        workspace_id: this.workspaceId,
        chunk_type: chunk.chunkType,
        position: chunk.position,
        token_count: chunk.tokenCount,
        heading_hierarchy: JSON.stringify(chunk.headingHierarchy),
        language: chunk.language || '',
        code_symbols: chunk.codeSymbols ? JSON.stringify(chunk.codeSymbols) : '',
      },
    }))

    // Step 1: Upsert vectors
    await this.vectorDb.upsert(COLLECTION, vectorDocs)

    // Step 2: Insert into FTS5 index
    for (const chunk of chunks) {
      const chunkId = `${documentId}_chunk_${chunk.position}`
      this.db.run('INSERT OR REPLACE INTO chunks_fts (chunk_id, content) VALUES (?, ?)', [chunkId, chunk.content])
    }

    // Step 3: Update SQLite -- if this fails, compensate by deleting the vectors we just inserted
    try {
      const now = new Date().toISOString()
      this.db.run(
        `UPDATE documents SET chunk_count = ?, status = 'indexed', indexed_at = ?, updated_at = ? WHERE id = ?`,
        [chunks.length, now, now, documentId]
      )
    } catch (err) {
      // Compensating action: remove vectors we just inserted to avoid orphaned vectors
      const chunkIds = chunks.map((_, i) => `${documentId}_chunk_${i}`)
      await this.vectorDb.delete(COLLECTION, chunkIds).catch(() => {})
      throw err
    }
  }

  async searchChunks(queryEmbedding: number[], topK: number, minScore?: number): Promise<SearchResult[]> {
    const results = await this.vectorDb.search(COLLECTION, {
      embedding: queryEmbedding,
      topK,
      filter: { workspace_id: this.workspaceId },
      minScore,
    })
    return results.map(r => {
      const docId = r.metadata.document_id as string
      const doc = this.getDocument(docId)
      return {
        chunkId: r.id,
        content: r.content,
        score: r.score,
        documentId: docId,
        chunkType: r.metadata.chunk_type as string,
        headingHierarchy: JSON.parse((r.metadata.heading_hierarchy as string) || '[]'),
        sourcePath: doc?.source_path || '',
        sourceType: doc?.source_type || '',
      }
    })
  }

  searchFTS(query: string, topK: number): SearchResult[] {
    // Escape FTS5 special characters by wrapping each word in double quotes
    const safeQuery = query
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => `"${w.replace(/"/g, '""')}"`)
      .join(' ')
    if (!safeQuery) return []

    interface FTSRow { chunk_id: string; content: string; rank: number; [key: string]: unknown }
    const rows = this.db.all<FTSRow>(
      `SELECT chunk_id, content, rank FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?`,
      [safeQuery, topK]
    )
    return rows.map((r) => {
      const docId = r.chunk_id.split('_chunk_')[0]
      const doc = this.getDocument(docId)
      return {
        chunkId: r.chunk_id,
        content: r.content,
        score: 1 / (1 + Math.abs(r.rank)), // normalize FTS5 rank to 0-1
        documentId: docId,
        chunkType: 'semantic',
        headingHierarchy: [],
        sourcePath: doc?.source_path || '',
        sourceType: doc?.source_type || '',
      }
    })
  }

  /**
   * Soft-delete a document. Sets deleted_at timestamp.
   * NOTE: Vector embeddings are permanently deleted from LanceDB (no soft-delete support).
   * To make the document searchable again after restore, it must be re-indexed.
   */
  async softDeleteDocument(documentId: string): Promise<void> {
    // Soft delete: set deleted_at timestamp
    const now = new Date().toISOString()
    this.db.run(
      'UPDATE documents SET deleted_at = ?, updated_at = ? WHERE id = ?',
      [now, now, documentId]
    )
    // Clean FTS index
    this.db.run('DELETE FROM chunks_fts WHERE chunk_id LIKE ?', [documentId + '_%'])
    // Also remove vectors (they can't be soft-deleted in LanceDB)
    await this.vectorDb.deleteByFilter(COLLECTION, { document_id: documentId })
  }

  async hardDeleteDocument(documentId: string): Promise<void> {
    // Step 1: Delete vectors. If this throws, SQLite delete is never reached -- both stores remain consistent.
    await this.vectorDb.deleteByFilter(COLLECTION, { document_id: documentId })

    // Step 2: Delete SQLite row permanently.
    this.db.run('DELETE FROM documents WHERE id = ?', [documentId])
  }

  /** @deprecated Use softDeleteDocument instead */
  async deleteDocument(documentId: string): Promise<void> {
    return this.hardDeleteDocument(documentId)
  }

  /**
   * Restore a soft-deleted document. Resets status to 'pending'.
   * The document will need to be re-indexed (opendocs index) to regenerate embeddings.
   */
  restoreDocument(documentId: string): void {
    this.db.run(
      'UPDATE documents SET deleted_at = NULL, status = ?, updated_at = ? WHERE id = ?',
      ['pending', new Date().toISOString(), documentId]
    )
  }

  listDeletedDocuments(): DocumentRow[] {
    return this.db.all<DocumentRow>(
      'SELECT * FROM documents WHERE workspace_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC',
      [this.workspaceId]
    )
  }

  updateContentHash(documentId: string, hash: string): void {
    this.db.run(
      'UPDATE documents SET content_hash = ?, updated_at = ? WHERE id = ?',
      [hash, new Date().toISOString(), documentId]
    )
  }

  hasContentChanged(documentId: string, newHash: string): boolean {
    const doc = this.getDocument(documentId)
    if (!doc) return true
    return doc.content_hash !== newHash
  }

  updateStatus(documentId: string, status: string, errorMessage?: string): void {
    this.db.run(
      'UPDATE documents SET status = ?, error_message = ?, updated_at = ? WHERE id = ?',
      [status, errorMessage || null, new Date().toISOString(), documentId]
    )
  }
}
