// packages/core/src/storage/lancedb.ts
import * as lancedb from '@lancedb/lancedb'
import type { VectorDB, VectorDocument, VectorSearchOpts, VectorSearchResult } from './vector-db.js'

/**
 * Metadata fields promoted to top-level LanceDB columns for efficient filtering.
 * Any remaining metadata is stored in `metadata_json` as a JSON string.
 */
const PROMOTED_FIELDS = ['workspace_id', 'document_id', 'chunk_type', 'position', 'token_count'] as const

export async function createLanceDB(dataDir: string): Promise<VectorDB> {
  const db = await lancedb.connect(dataDir)

  return {
    async ensureCollection(name: string, dimensions: number): Promise<void> {
      const tableNames = await db.tableNames()
      if (!tableNames.includes(name)) {
        // Create table with a dummy record to establish schema, then delete it
        await db.createTable(name, [
          {
            id: '__init__',
            content: '',
            vector: new Array(dimensions).fill(0),
            workspace_id: '',
            document_id: '',
            chunk_type: '',
            position: 0,
            token_count: 0,
            metadata_json: '{}',
          },
        ])
        const table = await db.openTable(name)
        await table.delete('id = "__init__"')
      }
    },

    async upsert(collectionName: string, documents: VectorDocument[]): Promise<void> {
      const table = await db.openTable(collectionName)
      const rows = documents.map(d => {
        // Extract promoted fields from metadata, put the rest in metadata_json
        const remaining: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(d.metadata)) {
          if (!(PROMOTED_FIELDS as readonly string[]).includes(key)) {
            remaining[key] = value
          }
        }
        return {
          id: d.id,
          content: d.content,
          vector: d.embedding,
          workspace_id: (d.metadata.workspace_id as string) || '',
          document_id: (d.metadata.document_id as string) || '',
          chunk_type: (d.metadata.chunk_type as string) || '',
          position: (d.metadata.position as number) || 0,
          token_count: (d.metadata.token_count as number) || 0,
          metadata_json: JSON.stringify(remaining),
        }
      })

      // Delete existing IDs first (upsert semantics), then add new ones
      for (const doc of documents) {
        try {
          await table.delete(`id = "${doc.id}"`)
        } catch {
          // ID doesn't exist yet, that's fine
        }
      }
      await table.add(rows)
    },

    async search(collectionName: string, opts: VectorSearchOpts): Promise<VectorSearchResult[]> {
      const table = await db.openTable(collectionName)
      let query = table.search(opts.embedding).limit(opts.topK)

      // Apply filter if provided: convert { key: value } to SQL-like where clause
      if (opts.filter && Object.keys(opts.filter).length > 0) {
        const conditions = Object.entries(opts.filter).map(([key, value]) => {
          if (typeof value === 'string') {
            return `${key} = '${value}'`
          }
          return `${key} = ${value}`
        })
        query = query.where(conditions.join(' AND '))
      }

      const results = await (query as lancedb.VectorQuery).toArray()

      return results
        .map(row => {
          // Reconstruct full metadata from promoted columns + metadata_json
          const extra = JSON.parse((row.metadata_json as string) || '{}') as Record<string, unknown>
          const metadata: Record<string, string | number | boolean> = {
            workspace_id: row.workspace_id as string,
            document_id: row.document_id as string,
            chunk_type: row.chunk_type as string,
            position: row.position as number,
            token_count: row.token_count as number,
          }
          for (const [k, v] of Object.entries(extra)) {
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
              metadata[k] = v
            }
          }
          return {
            id: row.id as string,
            content: row.content as string,
            score: 1 - (row._distance as number), // LanceDB returns L2 distance; convert to similarity
            metadata,
          }
        })
        .filter(r => !opts.minScore || r.score >= opts.minScore)
    },

    async delete(collectionName: string, ids: string[]): Promise<void> {
      const table = await db.openTable(collectionName)
      for (const id of ids) {
        await table.delete(`id = "${id}"`)
      }
    },

    async deleteByFilter(collectionName: string, filter: string): Promise<void> {
      const table = await db.openTable(collectionName)
      await table.delete(filter)
    },

    async count(collectionName: string): Promise<number> {
      const table = await db.openTable(collectionName)
      return await table.countRows()
    },

    async close(): Promise<void> {
      // LanceDB connections are cleaned up on garbage collection; no explicit close needed
    },
  }
}
