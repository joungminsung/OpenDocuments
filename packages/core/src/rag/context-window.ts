import type { SearchResult } from '../ingest/document-store.js'
import type { QueryIntent } from './intent.js'
import { estimateTokens } from '../utils/tokenizer.js'

export interface ContextWindowConfig {
  maxContextTokens: number
  allocation: {
    systemPrompt: number  // fraction, e.g., 0.1
    chatHistory: number   // fraction, e.g., 0.2
    retrievedChunks: number // fraction, e.g., 0.5
    generationBuffer: number // fraction, e.g., 0.2
  }
}

export const DEFAULT_CONTEXT_WINDOW_CONFIG: ContextWindowConfig = {
  maxContextTokens: 16384,
  allocation: { systemPrompt: 0.1, chatHistory: 0.15, retrievedChunks: 0.65, generationBuffer: 0.1 },
}

const INTENT_ALLOCATIONS: Partial<Record<QueryIntent, ContextWindowConfig['allocation']>> = {
  code:    { systemPrompt: 0.1, chatHistory: 0.05, retrievedChunks: 0.75, generationBuffer: 0.1 },
  concept: { systemPrompt: 0.1, chatHistory: 0.2,  retrievedChunks: 0.55, generationBuffer: 0.15 },
  config:  { systemPrompt: 0.1, chatHistory: 0.1,  retrievedChunks: 0.7,  generationBuffer: 0.1 },
  data:    { systemPrompt: 0.1, chatHistory: 0.05, retrievedChunks: 0.7,  generationBuffer: 0.15 },
  compare: { systemPrompt: 0.1, chatHistory: 0.1,  retrievedChunks: 0.65, generationBuffer: 0.15 },
}

/**
 * Fit retrieved chunks into the available context window.
 * Trims lowest-scoring chunks first, then truncates long chunks.
 */
export function fitToContextWindow(
  chunks: SearchResult[],
  config: ContextWindowConfig = DEFAULT_CONTEXT_WINDOW_CONFIG,
  chatHistoryTokens = 0,
  systemPromptTokens = 0,
  intent?: QueryIntent
): SearchResult[] {
  const allocation = (intent && INTENT_ALLOCATIONS[intent]) || config.allocation
  const intendedChunkTokens = Math.floor(config.maxContextTokens * allocation.retrievedChunks)
  const generationBufferTokens = Math.floor(config.maxContextTokens * allocation.generationBuffer)
  const availableChunkTokens = config.maxContextTokens - generationBufferTokens - chatHistoryTokens - systemPromptTokens
  const maxChunkTokens = Math.max(0, Math.min(intendedChunkTokens, availableChunkTokens))

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
