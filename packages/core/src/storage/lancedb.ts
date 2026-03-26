// packages/core/src/storage/lancedb.ts
import * as lancedb from '@lancedb/lancedb'
import type { VectorDB, VectorDocument, VectorSearchOpts, VectorSearchResult } from './vector-db.js'

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
            metadata: '{}',
          },
        ])
        const table = await db.openTable(name)
        await table.delete('id = "__init__"')
      }
    },

    async upsert(collectionName: string, documents: VectorDocument[]): Promise<void> {
      const table = await db.openTable(collectionName)
      const rows = documents.map(d => ({
        id: d.id,
        content: d.content,
        vector: d.embedding,
        metadata: JSON.stringify(d.metadata),
      }))

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
      const query = table.search(opts.embedding).limit(opts.topK)

      const results = await (query as lancedb.VectorQuery).toArray()

      return results
        .map(row => ({
          id: row.id as string,
          content: row.content as string,
          score: 1 - (row._distance as number), // LanceDB returns L2 distance; convert to similarity
          metadata: JSON.parse(row.metadata as string) as Record<string, string | number | boolean>,
        }))
        .filter(r => !opts.minScore || r.score >= opts.minScore)
    },

    async delete(collectionName: string, ids: string[]): Promise<void> {
      const table = await db.openTable(collectionName)
      for (const id of ids) {
        await table.delete(`id = "${id}"`)
      }
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
