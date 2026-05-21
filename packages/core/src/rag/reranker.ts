import type { SearchResult } from '../ingest/document-store.js'
import type { ModelPlugin } from '../plugin/interfaces.js'
import type { QueryIntent } from './intent.js'

/**
 * Intent-specific weight profiles for fallback reranking.
 * Weights: [originalScore, wordMatch, ngramPhrase, headingBoost, chunkTypeBoost]
 */
const INTENT_WEIGHTS: Record<string, number[]> = {
  code:    [0.3, 0.2, 0.1, 0.15, 0.25],
  concept: [0.35, 0.3, 0.15, 0.15, 0.05],
  config:  [0.35, 0.25, 0.15, 0.15, 0.1],
  data:    [0.3, 0.2, 0.1, 0.15, 0.25],
  search:  [0.4, 0.25, 0.15, 0.2, 0.0],
  compare: [0.35, 0.3, 0.15, 0.15, 0.05],
  general: [0.4, 0.25, 0.15, 0.2, 0.0],
}

const INTENT_CHUNK_PREFERENCES: Record<string, string[]> = {
  code: ['code-ast'],
  config: ['code-ast', 'semantic'],
  data: ['table'],
  concept: ['semantic'],
}

/**
 * Rerank search results using the model's rerank capability,
 * or fall back to improved keyword scoring with heading boost, partial matching,
 * and intent-adaptive weight profiles.
 */
export async function rerankResults(
  query: string,
  results: SearchResult[],
  model?: ModelPlugin,
  intent?: QueryIntent
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

      // Chunk type alignment bonus
      const preferredTypes = intent ? INTENT_CHUNK_PREFERENCES[intent] : undefined
      const chunkTypeBonus = preferredTypes && preferredTypes.includes(r.chunkType) ? 1.0 : 0.0

      // Intent-adaptive weights: [original, word, ngram, heading, chunkType]
      const w = INTENT_WEIGHTS[intent || 'general']
      const finalScore = r.score * w[0] + wordScore * w[1] + ngramScore * w[2] + headingScore * w[3] + chunkTypeBonus * w[4]

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
