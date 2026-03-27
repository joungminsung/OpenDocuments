import { DocumentStore, type SearchResult } from '../ingest/document-store.js'
import type { ModelPlugin } from '../plugin/interfaces.js'
import { reciprocalRankFusion } from './cross-lingual.js'
import { createEmbeddingCache } from './cache.js'
import { sha256 } from '../utils/hash.js'

export interface RetrieveOptions {
  k: number
  finalTopK: number
  minScore?: number
}

export class Retriever {
  private embedFn: (texts: string[]) => Promise<import('../plugin/interfaces.js').EmbeddingResult>
  private embeddingCache = createEmbeddingCache()

  constructor(
    private store: DocumentStore,
    embedder: ModelPlugin
  ) {
    if (!embedder.embed) throw new Error('Embedding model must support embed()')
    this.embedFn = embedder.embed.bind(embedder)
  }

  async retrieve(query: string, opts: RetrieveOptions): Promise<SearchResult[]> {
    // L2 embedding cache
    // SHA-256 is used for consistency with other hash functions in the codebase.
    // CPU overhead is negligible compared to the embedding API call itself.
    const cacheKey = sha256(query)
    let queryEmbedding = this.embeddingCache.get(cacheKey)
    if (!queryEmbedding) {
      const embedResult = await this.embedFn([query])
      queryEmbedding = embedResult.dense[0]
      this.embeddingCache.set(cacheKey, queryEmbedding)
    }
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
