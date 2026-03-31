import type { SearchResult } from '../ingest/document-store.js'

export interface ContextWindowConfig {
  maxContextTokens: number
  allocation: {
    systemPrompt: number  // fraction, e.g., 0.1
    chatHistory: number   // fraction, e.g., 0.2
    retrievedChunks: number // fraction, e.g., 0.5
    generationBuffer: number // fraction, e.g., 0.2
  }
}

const DEFAULT_CONFIG: ContextWindowConfig = {
  maxContextTokens: 4096,
  allocation: { systemPrompt: 0.1, chatHistory: 0.2, retrievedChunks: 0.5, generationBuffer: 0.2 },
}

function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u3000-\u9fff\uac00-\ud7af]/g) || []).length
  return Math.ceil((text.length - cjk) / 4 + cjk / 1.5)
}

/**
 * Fit retrieved chunks into the available context window.
 * Trims lowest-scoring chunks first, then truncates long chunks.
 */
export function fitToContextWindow(
  chunks: SearchResult[],
  config: ContextWindowConfig = DEFAULT_CONFIG,
  _chatHistoryTokens = 0,
  _systemPromptTokens = 0
): SearchResult[] {
  const maxChunkTokens = Math.floor(
    config.maxContextTokens * config.allocation.retrievedChunks
  )

  // Already sorted by score (highest first)
  const fitted: SearchResult[] = []
  let usedTokens = 0

  for (const chunk of chunks) {
    const tokens = estimateTokens(chunk.content)

    if (usedTokens + tokens <= maxChunkTokens) {
      fitted.push(chunk)
      usedTokens += tokens
    } else {
      // Try to truncate this chunk to fit remaining space
      const remaining = maxChunkTokens - usedTokens
      if (remaining > 50) { // Only if there's meaningful space left
        // Estimate chars from remaining tokens (CJK-aware)
        const cjkRatio = (chunk.content.match(/[\u3000-\u9fff\uac00-\ud7af]/g) || []).length / chunk.content.length
        const charsPerToken = cjkRatio > 0.3 ? 1.5 : 4
        let maxChars = Math.floor(remaining * charsPerToken)
        let truncatedContent = chunk.content.substring(0, maxChars)
        // Find nearest sentence boundary (. ! ? or newline) to avoid cutting mid-sentence
        const lastBoundary = Math.max(
          truncatedContent.lastIndexOf('. '),
          truncatedContent.lastIndexOf('.\n'),
          truncatedContent.lastIndexOf('! '),
          truncatedContent.lastIndexOf('? '),
          truncatedContent.lastIndexOf('\n\n'),
        )
        if (lastBoundary > maxChars * 0.5) {
          truncatedContent = truncatedContent.substring(0, lastBoundary + 1)
        }
        fitted.push({ ...chunk, content: truncatedContent.trim() + '...' })
      }
      break
    }
  }

  return fitted
}
