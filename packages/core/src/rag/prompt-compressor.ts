import { estimateTokens } from '../utils/tokenizer.js'
import type { SearchResult } from '../ingest/document-store.js'

/** Minimum sentence length (characters) considered for deduplication. */
const MIN_SENTENCE_LENGTH = 20

/**
 * Split text into sentences using punctuation boundaries.
 * Preserves trailing whitespace with each sentence.
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace or end of string
  const parts = text.split(/(?<=[.!?。])\s+/)
  return parts.filter(s => s.trim().length > 0)
}

/**
 * Rejoin sentences into a single string, adding a space between each.
 */
function joinSentences(sentences: string[]): string {
  return sentences.join(' ')
}

/**
 * Compute total token count for all chunks.
 */
function totalTokens(chunks: SearchResult[]): number {
  return chunks.reduce((sum, c) => sum + estimateTokens(c.content), 0)
}

/**
 * Strategy 1: Remove lowest-scoring chunks until total tokens fit within budget.
 */
function removeLowestScoring(chunks: SearchResult[], maxTokens: number): SearchResult[] {
  // Work on a copy sorted by descending score so we drop from the end
  const sorted = [...chunks].sort((a, b) => b.score - a.score)
  while (sorted.length > 1 && totalTokens(sorted) > maxTokens) {
    sorted.pop()
  }
  // Restore original order (by chunkId position in the original array)
  const kept = new Set(sorted.map(c => c.chunkId))
  return chunks.filter(c => kept.has(c.chunkId))
}

/**
 * Strategy 2: Deduplicate sentences across chunks.
 * Sentences shorter than {@link MIN_SENTENCE_LENGTH} characters are kept as-is
 * (never treated as duplicates).
 */
function deduplicateSentences(chunks: SearchResult[]): SearchResult[] {
  const seen = new Set<string>()
  return chunks.map(chunk => {
    const sentences = splitSentences(chunk.content)
    const unique = sentences.filter(s => {
      const normalized = s.trim()
      if (normalized.length < MIN_SENTENCE_LENGTH) {
        // Keep short sentences without tracking them as duplicates
        return true
      }
      if (seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
    return { ...chunk, content: joinSentences(unique) }
  })
}

/**
 * Strategy 3: Proportionally truncate each chunk at sentence boundaries.
 * Each chunk gets a share of the remaining budget proportional to its token count.
 */
function proportionalTruncate(chunks: SearchResult[], maxTokens: number): SearchResult[] {
  const tokenCounts = chunks.map(c => estimateTokens(c.content))
  const total = tokenCounts.reduce((a, b) => a + b, 0)
  if (total === 0) return chunks

  return chunks.map((chunk, i) => {
    const allowedTokens = Math.floor((tokenCounts[i] / total) * maxTokens)
    if (tokenCounts[i] <= allowedTokens) return chunk

    const sentences = splitSentences(chunk.content)
    const kept: string[] = []
    let used = 0
    for (const s of sentences) {
      const t = estimateTokens(s)
      if (used + t > allowedTokens) break
      kept.push(s)
      used += t
    }
    return { ...chunk, content: joinSentences(kept) }
  })
}

/**
 * Compress context chunks to fit within a token budget using a three-stage strategy:
 *
 * 1. If total tokens already fit, return unchanged.
 * 2. Remove the lowest-scoring chunks until under budget.
 * 3. Deduplicate repeated sentences across the remaining chunks.
 * 4. Proportionally truncate each chunk at sentence boundaries if still over budget.
 *
 * @param chunks   Ranked search results to compress.
 * @param maxTokens Maximum total token count for the returned chunks.
 * @returns A new array of (potentially modified) SearchResult objects.
 */
export function compressContext(chunks: SearchResult[], maxTokens: number): SearchResult[] {
  if (chunks.length === 0) return chunks

  // No compression needed
  if (totalTokens(chunks) <= maxTokens) return chunks

  // Strategy 1: drop lowest-scoring chunks
  let result = removeLowestScoring(chunks, maxTokens)
  if (totalTokens(result) <= maxTokens) return result

  // Strategy 2: deduplicate sentences across remaining chunks
  result = deduplicateSentences(result)
  if (totalTokens(result) <= maxTokens) return result

  // Strategy 3: proportional truncation at sentence boundaries
  result = proportionalTruncate(result, maxTokens)
  return result
}
