// packages/core/src/storage/vector-db.ts
export interface VectorDocument {
  id: string
  content: string
  embedding: number[]
  metadata: Record<string, string | number | boolean>
}

export interface VectorSearchResult {
  id: string
  content: string
  score: number
  metadata: Record<string, string | number | boolean>
}

export interface VectorRecord {
  id: string
  content: string
  metadata: Record<string, string | number | boolean>
}

export interface VectorSearchOpts {
  embedding: number[]
  topK: number
  filter?: Record<string, string | number | boolean>
  minScore?: number
}

export interface VectorDB {
  ensureCollection(name: string, dimensions: number): Promise<void>
  upsert(collection: string, documents: VectorDocument[]): Promise<void>
  search(collection: string, opts: VectorSearchOpts): Promise<VectorSearchResult[]>
  getByIds(
    collection: string,
    ids: string[],
    filter?: Record<string, string | number | boolean>
  ): Promise<VectorRecord[]>
  delete(collection: string, ids: string[]): Promise<void>
  /**
   * Delete documents matching a structured filter.
   * The filter object maps column names to values, which are safely escaped
   * before being passed to the database engine.
   */
  deleteByFilter(collection: string, filter: Record<string, string | number | boolean>): Promise<void>
  count(collection: string): Promise<number>
  close(): Promise<void>
}
