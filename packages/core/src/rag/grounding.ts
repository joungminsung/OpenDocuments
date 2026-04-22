import type { SearchResult } from '../ingest/document-store.js'
import type { EmbeddingResult } from '../plugin/interfaces.js'

const STOPWORDS = new Set([
  'this', 'that', 'with', 'from', 'have', 'been', 'will', 'they',
  'their', 'there', 'what', 'when', 'where', 'which', 'about', 'into',
  'more', 'some', 'than', 'them', 'then', 'these', 'very', 'also',
  'just', 'only', 'other', 'such',
])

export interface GroundingResult {
  groundedSentences: number
  ungroundedSentences: number
  totalSentences: number
  warnings: string[]
  annotatedAnswer: string
}

/**
 * Check if each sentence in the answer is grounded in the retrieved sources.
 * Uses simple word overlap heuristic (not LLM-based).
 */
export function checkGrounding(
  answer: string,
  sources: SearchResult[],
  strictMode = false
): GroundingResult {
  const sentences = splitSentences(answer)
  const sourceText = sources.map(s => s.content.toLowerCase()).join(' ')
  const sourceWords = new Set(sourceText.split(/\s+/).filter(w => w.length > 3 && !STOPWORDS.has(w)))

  let grounded = 0
  let ungrounded = 0
  const warnings: string[] = []
  const annotated: string[] = []

  for (const sentence of sentences) {
    const sentenceWords = sentence.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !STOPWORDS.has(w))
    if (sentenceWords.length === 0) {
      annotated.push(sentence)
      continue
    }

    const overlap = sentenceWords.filter(w => sourceWords.has(w)).length
    const coverage = overlap / sentenceWords.length

    // Threshold: at least 40% of significant words should appear in sources
    const threshold = strictMode ? 0.5 : 0.4

    if (coverage >= threshold) {
      grounded++
      annotated.push(sentence)
    } else {
      ungrounded++
      if (strictMode) {
        warnings.push(`Unverified: "${sentence.substring(0, 80)}..."`)
        annotated.push(`[unverified] ${sentence}`)
      } else {
        annotated.push(sentence)
      }
    }
  }

  return {
    groundedSentences: grounded,
    ungroundedSentences: ungrounded,
    totalSentences: grounded + ungrounded,
    warnings,
    annotatedAnswer: annotated.join(' '),
  }
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Check if each sentence in the answer is semantically grounded in the retrieved sources.
 * Uses embedding cosine similarity when an embed function is provided,
 * falling back to word-overlap `checkGrounding()` when embed is null.
 */
export async function checkSemanticGrounding(
  answer: string,
  sources: SearchResult[],
  embed: ((texts: string[]) => Promise<EmbeddingResult>) | null,
  strictMode = false,
  similarityThreshold?: number,
): Promise<GroundingResult> {
  // Fall back to word-overlap when no embed function
  if (!embed) {
    return checkGrounding(answer, sources, strictMode)
  }

  const sentences = splitSentences(answer)
  if (sentences.length === 0) {
    return {
      groundedSentences: 0,
      ungroundedSentences: 0,
      totalSentences: 0,
      warnings: [],
      annotatedAnswer: answer,
    }
  }

  // Filter out sentences with no significant words (same logic as checkGrounding)
  const significantSentences: { text: string; index: number }[] = []
  const allAnnotated: { index: number; text: string }[] = []

  for (let i = 0; i < sentences.length; i++) {
    const words = sentences[i].toLowerCase().split(/\s+/).filter(w => w.length > 3 && !STOPWORDS.has(w))
    if (words.length === 0) {
      allAnnotated.push({ index: i, text: sentences[i] })
    } else {
      significantSentences.push({ text: sentences[i], index: i })
    }
  }

  if (significantSentences.length === 0) {
    return {
      groundedSentences: 0,
      ungroundedSentences: 0,
      totalSentences: 0,
      warnings: [],
      annotatedAnswer: sentences.join(' '),
    }
  }

  const threshold = similarityThreshold ?? (strictMode ? 0.7 : 0.6)

  // Batch embed: source contents + answer sentences in one call
  const sourceTexts = sources.map(s => s.content)
  const sentenceTexts = significantSentences.map(s => s.text)
  const allTexts = [...sourceTexts, ...sentenceTexts]

  const embeddingResult = await embed(allTexts)
  const sourceVectors = embeddingResult.dense.slice(0, sourceTexts.length)
  const sentenceVectors = embeddingResult.dense.slice(sourceTexts.length)

  let grounded = 0
  let ungrounded = 0
  const warnings: string[] = []

  for (let i = 0; i < significantSentences.length; i++) {
    const sentVec = sentenceVectors[i]
    let maxSim = 0

    for (const srcVec of sourceVectors) {
      const sim = cosineSimilarity(sentVec, srcVec)
      if (sim > maxSim) maxSim = sim
    }

    if (maxSim >= threshold) {
      grounded++
      allAnnotated.push({ index: significantSentences[i].index, text: significantSentences[i].text })
    } else {
      ungrounded++
      if (strictMode) {
        warnings.push(`Unverified: "${significantSentences[i].text.substring(0, 80)}..."`)
        allAnnotated.push({ index: significantSentences[i].index, text: `[unverified] ${significantSentences[i].text}` })
      } else {
        allAnnotated.push({ index: significantSentences[i].index, text: significantSentences[i].text })
      }
    }
  }

  // Sort by original index to preserve sentence order
  allAnnotated.sort((a, b) => a.index - b.index)

  return {
    groundedSentences: grounded,
    ungroundedSentences: ungrounded,
    totalSentences: grounded + ungrounded,
    warnings,
    annotatedAnswer: allAnnotated.map(a => a.text).join(' '),
  }
}

function splitSentences(text: string): string[] {
  // Split on period/question/exclamation followed by space or end
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}
