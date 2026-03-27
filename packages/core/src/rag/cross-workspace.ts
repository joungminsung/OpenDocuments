import type { DB } from '../storage/db.js'
import type { VectorDB } from '../storage/vector-db.js'
import type { ModelPlugin } from '../plugin/interfaces.js'
import type { SearchResult } from '../ingest/document-store.js'

/**
 * Search across multiple workspaces. Only available to admin users.
 */
export async function crossWorkspaceSearch(
  db: DB,
  vectorDb: VectorDB,
  embedder: ModelPlugin,
  query: string,
  workspaceIds: string[],
  topK = 10
): Promise<SearchResult[]> {
  if (!embedder.embed) throw new Error('Embedding model required')

  const embedResult = await embedder.embed([query])
  const queryEmbedding = embedResult.dense[0]

  const allResults: SearchResult[] = []

  // Search each workspace
  for (const wsId of workspaceIds) {
    const results = await vectorDb.search('opendocuments_chunks', {
      embedding: queryEmbedding,
      topK: Math.ceil(topK / workspaceIds.length) + 2, // extra to compensate for merging
      filter: { workspace_id: wsId },
    })

    for (const r of results) {
      const docId = r.metadata.document_id as string
      const doc = db.get<any>('SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL', [docId])

      allResults.push({
        chunkId: r.id,
        content: r.content,
        score: r.score,
        documentId: docId,
        chunkType: r.metadata.chunk_type as string,
        headingHierarchy: JSON.parse((r.metadata.heading_hierarchy as string) || '[]'),
        sourcePath: doc?.source_path || '',
        sourceType: doc?.source_type || '',
      })
    }
  }

  return allResults.sort((a, b) => b.score - a.score).slice(0, topK)
}
