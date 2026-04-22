import { encodingForModel } from 'js-tiktoken'
import type { Tiktoken } from 'js-tiktoken'

let encoder: Tiktoken | null = null

/** Maximum characters to encode directly; beyond this, sample and extrapolate. */
const DIRECT_ENCODE_LIMIT = 10_000
/** Sample size (in characters) used for extrapolation on long texts. */
const SAMPLE_SIZE = 4_000

/**
 * Lazy-initialize the tiktoken encoder (singleton).
 * Returns null if tiktoken fails to initialize.
 */
function getEncoder(): Tiktoken | null {
  if (encoder) return encoder
  try {
    encoder = encodingForModel('gpt-4o')
    return encoder
  } catch {
    return null
  }
}

/**
 * Heuristic token estimation as fallback.
 * ~85% accuracy for English, ~70% for Korean.
 */
function heuristicEstimate(text: string): number {
  const cjk = (text.match(/[\u3000-\u9fff\uac00-\ud7af]/g) || []).length
  const nonCjk = text.length - cjk
  return Math.ceil(nonCjk / 4 + cjk / 1.5)
}

/**
 * Estimate the number of tokens in a string using tiktoken encoding.
 * For texts longer than {@link DIRECT_ENCODE_LIMIT} characters, samples a
 * representative portion and extrapolates to avoid O(n) BPE overhead.
 * Falls back to a CJK-aware heuristic if tiktoken is unavailable.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0

  const enc = getEncoder()
  if (enc) {
    try {
      if (text.length <= DIRECT_ENCODE_LIMIT) {
        return enc.encode(text).length
      }
      // For long texts, sample from start and middle to get a representative ratio
      const startSample = text.slice(0, SAMPLE_SIZE)
      const midStart = Math.floor((text.length - SAMPLE_SIZE) / 2)
      const midSample = text.slice(midStart, midStart + SAMPLE_SIZE)
      const sampleTokens = enc.encode(startSample).length + enc.encode(midSample).length
      const sampleChars = SAMPLE_SIZE * 2
      const tokensPerChar = sampleTokens / sampleChars
      return Math.ceil(text.length * tokensPerChar)
    } catch {
      return heuristicEstimate(text)
    }
  }
  return heuristicEstimate(text)
}
