import { DocumentStore, type SearchResult } from '../ingest/document-store.js'
import type { ModelPlugin } from '../plugin/interfaces.js'
import { reciprocalRankFusion } from './cross-lingual.js'

export interface RetrieveOptions {
  k: number
  finalTopK: number
  minScore?: number
}

export class Retriever {
  private embedFn: (texts: string[]) => Promise<import('../plugin/interfaces.js').EmbeddingResult>

  constructor(
    private store: DocumentStore,
    embedder: ModelPlugin
  ) {
    if (!embedder.embed) throw new Error('Embedding model must support embed()')
    this.embedFn = embedder.embed.bind(embedder)
  }

  async retrieve(query: string, opts: RetrieveOptions): Promise<SearchResult[]> {
    // Dense search
    const embedResult = await this.embedFn([query])
    const queryEmbedding = embedResult.dense[0]
    const denseResults = await this.store.searchChunks(queryEmbedding, opts.k, opts.minScore)

    // Sparse search (FTS5)
    let sparseResults: SearchResult[] = []
    try {
      sparseResults = this.store.searchFTS(query, opts.k)
    } catch {
      // FTS5 table may not exist yet (pre-migration) -- fall back to dense only
    }

    // RRF merge if we have sparse results
    if (sparseResults.length > 0) {
      const merged = reciprocalRankFusion([denseResults, sparseResults], 60, (item) => item.chunkId)
      return merged.slice(0, opts.finalTopK)
    }

    return denseResults.slice(0, opts.finalTopK)
  }
}
