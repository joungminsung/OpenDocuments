import type { SearchResult } from '../ingest/document-store.js'
import type { ModelPlugin } from '../plugin/interfaces.js'

/**
 * Rerank search results using the model's rerank capability,
 * or fall back to improved keyword scoring with heading boost and partial matching.
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

  // Improved fallback: partial matching + heading boost
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1)

  return results
    .map(r => {
      const contentLower = r.content.toLowerCase()
      const headingText = (r.headingHierarchy || []).join(' ').toLowerCase()

      // Partial/substring matching: check if query word is a substring of any content word
      let contentMatches = 0
      for (const qw of queryWords) {
        if (contentLower.includes(qw)) contentMatches++
      }
      const contentScore = queryWords.length > 0 ? contentMatches / queryWords.length : 0

      // Heading boost: query words in headings are strong relevance signals
      let headingMatches = 0
      for (const qw of queryWords) {
        if (headingText.includes(qw)) headingMatches++
      }
      const headingScore = queryWords.length > 0 ? headingMatches / queryWords.length : 0

      // Combined score: original * 0.5 + content overlap * 0.3 + heading boost * 0.2
      const finalScore = r.score * 0.5 + contentScore * 0.3 + headingScore * 0.2

      return { ...r, score: finalScore }
    })
    .sort((a, b) => b.score - a.score)
}
