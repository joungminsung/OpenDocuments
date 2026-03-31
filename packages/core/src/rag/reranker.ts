import type { SearchResult } from '../ingest/document-store.js'
import type { ModelPlugin } from '../plugin/interfaces.js'

/**
 * Rerank search results using the model's rerank capability,
 * or fall back to a simple keyword overlap scoring.
 */
export async function rerankResults(
  query: string,
  results: SearchResult[],
  model?: ModelPlugin
): Promise<SearchResult[]> {
  if (results.length <= 1) return results

  // Try model reranker if available
  if (model?.rerank) {
    try {
      const docs = results.map(r => r.content)
      const reranked = await model.rerank(query, docs)
      if (!reranked.indices || !reranked.scores || reranked.indices.length !== reranked.scores.length) {
        console.warn('[reranker] Invalid rerank response: indices/scores length mismatch, falling back to keyword scoring')
      } else {
        return reranked.indices
          .filter(idx => idx >= 0 && idx < results.length)
          .map((idx, i) => ({
            ...results[idx],
            score: reranked.scores[i] ?? 0,
          }))
      }
    } catch (err) {
      console.warn('[reranker] Rerank failed, falling back to keyword scoring:', err instanceof Error ? err.message : String(err))
    }
  }

  // Fallback: keyword overlap scoring
  // Note: Set allocation per call is acceptable at current scale (typically <20 results).
  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 2))

  return results
    .map(r => {
      const contentWords = new Set(r.content.toLowerCase().split(/\s+/))
      const overlap = [...queryWords].filter(w => contentWords.has(w)).length
      const keywordScore = queryWords.size > 0 ? overlap / queryWords.size : 0
      return { ...r, score: r.score * 0.7 + keywordScore * 0.3 }
    })
    .sort((a, b) => b.score - a.score)
}
