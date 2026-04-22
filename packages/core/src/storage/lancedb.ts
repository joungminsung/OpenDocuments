// packages/core/src/storage/lancedb.ts
import * as lancedb from '@lancedb/lancedb'
import type { VectorDB, VectorDocument, VectorRecord, VectorSearchOpts, VectorSearchResult } from './vector-db.js'

function escapeDoubleQuotes(value: string): string {
  return value.replace(/"/g, '""')
}

function sanitizeFilterValue(value: string | number | boolean): string {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  // Escape single quotes to prevent injection
  return value.replace(/'/g, "''")
}

function buildWhereClause(filter: Record<string, string | number | boolean>): string {
  return Object.entries(filter)
    .map(([key, value]) => {
      // Only allow alphanumeric column names
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
        throw new Error(`Invalid filter key: ${key}`)
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return `${key} = ${value}`
      }
      return `${key} = '${sanitizeFilterValue(value)}'`
    })
    .join(' AND ')
}

function buildIdWhereClause(ids: string[]): string {
  if (ids.length === 0) return ''
  return ids
    .map((id) => `id = '${sanitizeFilterValue(id)}'`)
    .join(' OR ')
}

/**
 * Metadata fields promoted to top-level LanceDB columns for efficient filtering.
 * Any remaining metadata is stored in `metadata_json` as a JSON string.
 */
const PROMOTED_FIELDS = ['workspace_id', 'document_id', 'chunk_type', 'position', 'token_count'] as const

function hydrateRecord(row: Record<string, unknown>): VectorRecord {
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
    metadata,
  }
}

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
          await table.delete(`id = "${escapeDoubleQuotes(doc.id)}"`)
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
        query = query.where(buildWhereClause(opts.filter))
      }

      const results = await (query as lancedb.VectorQuery).toArray()

      return results
        .map(row => {
          const record = hydrateRecord(row as Record<string, unknown>)
          return {
            id: record.id,
            content: record.content,
            score: 1 / (1 + (row._distance as number)), // LanceDB returns L2 distance; convert to 0-1 similarity
            metadata: record.metadata,
          }
        })
        .filter(r => !opts.minScore || r.score >= opts.minScore)
    },

    async getByIds(
      collectionName: string,
      ids: string[],
      filter?: Record<string, string | number | boolean>,
    ): Promise<VectorRecord[]> {
      if (ids.length === 0) return []

      const table = await db.openTable(collectionName)
      const predicates = [buildIdWhereClause(ids)]
      if (filter && Object.keys(filter).length > 0) {
        predicates.push(buildWhereClause(filter))
      }
      const rows = await table.query()
        .where(predicates.map((predicate) => `(${predicate})`).join(' AND '))
        .limit(ids.length)
        .toArray()

      const byId = new Map(
        rows.map((row) => {
          const record = hydrateRecord(row as Record<string, unknown>)
          return [record.id, record] as const
        }),
      )

      return ids
        .map((id) => byId.get(id))
        .filter((record): record is VectorRecord => record !== undefined)
    },

    async delete(collectionName: string, ids: string[]): Promise<void> {
      const table = await db.openTable(collectionName)
      for (const id of ids) {
        await table.delete(`id = "${escapeDoubleQuotes(id)}"`)
      }
    },

    async deleteByFilter(collectionName: string, filter: Record<string, string | number | boolean>): Promise<void> {
      const table = await db.openTable(collectionName)
      await table.delete(buildWhereClause(filter))
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
