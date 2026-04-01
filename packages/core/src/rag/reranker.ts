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

  // Improved fallback: word-boundary matching + n-gram phrase scoring + heading boost
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1)

  return results
    .map(r => {
      const contentLower = r.content.toLowerCase()
      const headingText = (r.headingHierarchy || []).join(' ').toLowerCase()

      // Word-boundary matching: prevent false positives like "auth" matching "author"
      let contentMatches = 0
      for (const qw of queryWords) {
        if (matchesWordBoundary(qw, contentLower)) contentMatches++
      }
      const wordScore = queryWords.length > 0 ? contentMatches / queryWords.length : 0

      // N-gram phrase bonus: consecutive query word pairs/triples appearing together
      const ngramScore = computeNgramScore(queryWords, contentLower)

      // Heading boost: query words in headings are strong relevance signals
      let headingMatches = 0
      for (const qw of queryWords) {
        if (matchesWordBoundary(qw, headingText)) headingMatches++
      }
      const headingScore = queryWords.length > 0 ? headingMatches / queryWords.length : 0

      // Combined score: original * 0.4 + word match * 0.25 + n-gram bonus * 0.15 + heading * 0.2
      const finalScore = r.score * 0.4 + wordScore * 0.25 + ngramScore * 0.15 + headingScore * 0.2

      return { ...r, score: finalScore }
    })
    .sort((a, b) => b.score - a.score)
}

/** Escape special regex characters in a string. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Check if a query word appears as a whole word in the text (word-boundary matching). */
function matchesWordBoundary(word: string, text: string): boolean {
  const boundary = '[\\s.,;:!?()\\[\\]{}"\'\`/\\-]'
  const pattern = new RegExp(`(?:^|${boundary})${escapeRegExp(word)}(?:$|${boundary})`, 'i')
  return pattern.test(` ${text} `)
}

/**
 * Compute n-gram phrase score for consecutive query word pairs and triples.
 * Returns a value between 0 and 1 indicating how many consecutive n-grams appear in the content.
 */
function computeNgramScore(queryWords: string[], content: string): number {
  if (queryWords.length < 2) return 0

  let matchCount = 0
  let totalNgrams = 0

  // Bigrams (consecutive pairs)
  for (let i = 0; i < queryWords.length - 1; i++) {
    totalNgrams++
    const bigram = `${queryWords[i]} ${queryWords[i + 1]}`
    if (content.includes(bigram)) matchCount++
  }

  // Trigrams (consecutive triples)
  for (let i = 0; i < queryWords.length - 2; i++) {
    totalNgrams++
    const trigram = `${queryWords[i]} ${queryWords[i + 1]} ${queryWords[i + 2]}`
    if (content.includes(trigram)) matchCount++
  }

  return totalNgrams > 0 ? matchCount / totalNgrams : 0
}
