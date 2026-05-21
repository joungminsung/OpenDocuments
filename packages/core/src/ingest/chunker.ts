import { estimateTokens } from '../utils/tokenizer.js'
import type { EmbeddingResult } from '../plugin/interfaces.js'

export interface ChunkOptions {
  maxTokens: number
  overlap: number
}

export interface TextChunk {
  content: string
  position: number
  tokenCount: number
  headingHierarchy: string[]
  /**
   * The enclosing heading-section text -- the body bounded by the nearest heading
   * at or above the chunk's level. Used by parent-document retrieval to swap a
   * small, precisely-matched chunk for its surrounding section on generation.
   * Undefined for chunks without any enclosing heading (e.g. top-level prose).
   */
  parentSection?: string
}

/**
 * Split source text into heading-delimited sections.
 * A section is the content between one heading (inclusive of its heading line)
 * and the next heading of equal-or-shallower level.
 * Returns [{ headingPath, text }] in document order. Pre-heading content (before
 * any heading appears) is intentionally dropped -- chunks that live in that
 * region have an empty `headingHierarchy` and we want their `parentSection`
 * to stay undefined.
 */
function extractSections(text: string): Array<{ headingPath: string[]; text: string }> {
  const lines = text.split('\n')
  const sections: Array<{ headingPath: string[]; text: string }> = []
  const headingStack: Array<{ level: number; title: string }> = []
  let currentStart = 0
  let inHeadingSection = false

  const flush = (endLine: number) => {
    if (!inHeadingSection) return
    const body = lines.slice(currentStart, endLine).join('\n').trim()
    if (body.length === 0) return
    sections.push({
      headingPath: headingStack.map(h => h.title),
      text: body,
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.+)$/)
    if (m) {
      flush(i)
      const level = m[1].length
      const title = m[2].trim()
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop()
      }
      headingStack.push({ level, title })
      currentStart = i
      inHeadingSection = true
    }
  }
  flush(lines.length)
  return sections
}

/**
 * Look up the enclosing section text for a chunk with the given heading hierarchy.
 * Strategy:
 *  1. Exact-match on the heading path wins.
 *  2. Otherwise, take the deepest section whose heading path is a prefix of the
 *     chunk's path (or whose path has the chunk's path as a prefix). Prefer the
 *     longer of any ties. This handles both "chunk is inside a deeper section"
 *     and "chunk's heading path extends past our recorded sections" cases.
 */
function findParentSection(
  sections: Array<{ headingPath: string[]; text: string }>,
  headingHierarchy: string[]
): string | undefined {
  if (headingHierarchy.length === 0) return undefined
  const SEP = '\x1f'
  const hp = headingHierarchy.join(SEP)
  let best: string | undefined
  let bestDepth = -1
  for (const s of sections) {
    const sp = s.headingPath.join(SEP)
    if (sp === hp) return s.text // exact match wins
    const isPrefix = hp.startsWith(sp + SEP) || sp.startsWith(hp + SEP)
    if (isPrefix && s.headingPath.length > bestDepth) {
      best = s.text
      bestDepth = s.headingPath.length
    }
  }
  return best
}

function updateHeadingStack(stack: string[], para: string): string[] {
  const lines = para.split('\n')
  const updated = [...stack]
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      const level = match[1].length
      while (updated.length > 0) {
        // Stored headings no longer have leading '#' so we use the index position
        // as a proxy for level. We track level separately via a parallel structure.
        // Since we now store plain text, we rely on the stack length heuristic:
        // pop entries until the stack is shorter than `level` entries.
        if (updated.length >= level) updated.pop()
        else break
      }
      updated.push(line.trim().replace(/^#+\s*/, ''))
    }
  }
  return updated
}

/**
 * Split text into atomic blocks. A block is either:
 *  - a fenced code block (``` ... ```)
 *  - a contiguous pipe-table (2+ adjacent lines starting with `|`)
 *  - a heading + its first following paragraph (kept together)
 *  - a paragraph separated by blank lines
 * Blocks are never broken further by the paragraph splitter.
 */
export function splitIntoAtomicBlocks(text: string): string[] {
  const lines = text.split('\n')
  const blocks: string[] = []
  let i = 0

  const isFence = (line: string) => /^```/.test(line.trim())
  const isTableLine = (line: string) => /^\s*\|/.test(line)
  const isHeading = (line: string) => /^#{1,6}\s+/.test(line)

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block: consume through the closing fence
    if (isFence(line)) {
      const buf = [line]
      i++
      while (i < lines.length && !isFence(lines[i])) {
        buf.push(lines[i])
        i++
      }
      if (i < lines.length) {
        buf.push(lines[i])
        i++
      } // consume closing fence
      blocks.push(buf.join('\n'))
      continue
    }

    // Pipe table: requires at least two consecutive `|` lines to distinguish from stray bars
    if (isTableLine(line) && i + 1 < lines.length && isTableLine(lines[i + 1])) {
      const buf: string[] = []
      while (i < lines.length && isTableLine(lines[i])) {
        buf.push(lines[i])
        i++
      }
      blocks.push(buf.join('\n'))
      continue
    }

    // Heading: keep with the next paragraph
    if (isHeading(line)) {
      const buf = [line]
      i++
      // Skip blank lines between heading and paragraph
      while (i < lines.length && lines[i].trim() === '') i++
      // Consume the following paragraph until blank line or another block boundary
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !isHeading(lines[i]) &&
        !isFence(lines[i]) &&
        !isTableLine(lines[i])
      ) {
        buf.push(lines[i])
        i++
      }
      blocks.push(buf.join('\n'))
      continue
    }

    // Blank line — paragraph boundary
    if (line.trim() === '') {
      i++
      continue
    }

    // Regular paragraph
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isHeading(lines[i]) &&
      !isFence(lines[i]) &&
      !isTableLine(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    if (buf.length > 0) blocks.push(buf.join('\n'))
  }

  return blocks
}

export function chunkText(
  text: string,
  options: ChunkOptions = { maxTokens: 512, overlap: 50 }
): TextChunk[] {
  const { maxTokens, overlap } = options
  const paragraphs = splitIntoAtomicBlocks(text)
  if (paragraphs.length === 0) return []

  // Pre-compute heading-delimited sections so every emitted chunk can resolve
  // its enclosing parent-section text without rescanning the source.
  const sections = extractSections(text)

  const chunks: TextChunk[] = []
  let currentParagraphs: string[] = []
  let currentTokens = 0
  // Heading stack carries forward between chunks instead of accumulating full text history
  let currentHeadings: string[] = []

  // A paragraph starts a new heading section iff its first non-blank line is a
  // markdown ATX heading. We split chunks at these boundaries so each chunk's
  // content belongs to a single section -- which is what parent-document
  // retrieval needs in order to swap in the correct enclosing section text.
  const startsWithHeading = (para: string): boolean =>
    /^#{1,6}\s+/.test(para.trimStart())

  const emitChunk = (content: string, headings: string[]) => {
    chunks.push({
      content,
      position: chunks.length,
      tokenCount: estimateTokens(content),
      headingHierarchy: [...headings],
      parentSection: findParentSection(sections, headings),
    })
  }

  const flushBuffer = () => {
    if (currentParagraphs.length === 0) return
    emitChunk(currentParagraphs.join('\n\n'), currentHeadings)
    currentParagraphs = []
    currentTokens = 0
  }

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para)
    const paraStartsHeading = startsWithHeading(para)

    // A new heading boundary: flush whatever we've accumulated (labeled with
    // the prior heading state) and then advance the heading stack before we
    // start adding to the new chunk. This way the new chunk's content and its
    // headingHierarchy both reflect the new section.
    if (paraStartsHeading) {
      if (currentParagraphs.length > 0) {
        flushBuffer()
      }
      currentHeadings = updateHeadingStack(currentHeadings, para)
    }

    // Oversized atomic block: flush buffer, emit this block on its own.
    if (paraTokens > maxTokens) {
      flushBuffer()
      emitChunk(para, currentHeadings)
      // For non-heading oversized blocks, also advance the heading stack (no-op
      // for regular paragraphs, but keeps the behavior consistent).
      if (!paraStartsHeading) {
        currentHeadings = updateHeadingStack(currentHeadings, para)
      }
      continue
    }

    if (currentTokens + paraTokens > maxTokens && currentParagraphs.length > 0) {
      emitChunk(currentParagraphs.join('\n\n'), currentHeadings)

      const overlapParagraphs: string[] = []
      let overlapTokens = 0
      for (let i = currentParagraphs.length - 1; i >= 0; i--) {
        const pTokens = estimateTokens(currentParagraphs[i])
        if (overlapTokens + pTokens > overlap) break
        overlapParagraphs.unshift(currentParagraphs[i])
        overlapTokens += pTokens
      }

      // Update heading stack by scanning all flushed paragraphs that were not
      // already accounted for at heading-boundary entry. Heading updates are
      // idempotent so re-processing overlap paragraphs is safe.
      for (const flushed of currentParagraphs) {
        currentHeadings = updateHeadingStack(currentHeadings, flushed)
      }

      currentParagraphs = [...overlapParagraphs]
      currentTokens = overlapTokens
    }

    currentParagraphs.push(para)
    currentTokens += paraTokens
  }

  flushBuffer()

  return chunks
}

/**
 * Calculates cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Splits text into sentence-level chunks based on semantic similarity of adjacent sentences.
 * Sentences with similar embeddings are grouped together. Chunk boundaries are placed where
 * similarity drops below the threshold.
 *
 * Falls back to paragraph-based `chunkText()` when the embedder is null or embedding fails.
 *
 * @param text - The input text to chunk
 * @param options - Chunk options (maxTokens, overlap)
 * @param embed - Embedding function, or null to fall back to paragraph chunking
 * @param similarityThreshold - Cosine similarity threshold for splitting (default 0.5)
 * @returns Array of text chunks with position and heading metadata
 */
/**
 * Pre-scan text for heading lines and record their character offsets.
 * Returns a map from sentence index to the heading stack at that point.
 */
function extractHeadingMap(text: string, sentences: string[]): Map<number, string[]> {
  const headingMap = new Map<number, string[]>()
  const lines = text.split('\n')
  let headingStack: string[] = []
  let charOffset = 0

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      headingStack = updateHeadingStack(headingStack, line)
      // Find which sentence index contains this heading's character offset
      let sentStart = 0
      for (let i = 0; i < sentences.length; i++) {
        const sentEnd = sentStart + sentences[i].length
        if (charOffset >= sentStart && charOffset < sentEnd + 2) {
          headingMap.set(i, [...headingStack])
          break
        }
        sentStart = sentEnd + 1 // +1 for the space between sentences
      }
    }
    charOffset += line.length + 1 // +1 for newline
  }

  return headingMap
}

export async function semanticChunkText(
  text: string,
  options: ChunkOptions = { maxTokens: 512, overlap: 50 },
  embed: ((texts: string[]) => Promise<EmbeddingResult>) | null,
  similarityThreshold: number = 0.5
): Promise<TextChunk[]> {
  if (!embed) {
    return chunkText(text, options)
  }

  // Split into sentences
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)

  if (sentences.length === 0) return []

  // Pre-scan for headings before sentence splitting destroys newline structure
  const headingMap = extractHeadingMap(text, sentences)
  // Pre-compute heading-delimited sections for parent-section lookup
  const sections = extractSections(text)

  // Embed all sentences
  let embeddings: number[][]
  try {
    const result = await embed(sentences)
    embeddings = result.dense
  } catch {
    return chunkText(text, options)
  }

  // Calculate similarity between adjacent sentences and find boundary indices
  const boundaries: number[] = [0] // first group always starts at 0
  for (let i = 0; i < sentences.length - 1; i++) {
    const sim = cosineSimilarity(embeddings[i], embeddings[i + 1])
    if (sim < similarityThreshold) {
      boundaries.push(i + 1)
    }
  }

  // Build semantic groups from boundaries
  const groups: string[][] = []
  const groupSentenceIndices: number[][] = []
  for (let b = 0; b < boundaries.length; b++) {
    const start = boundaries[b]
    const end = b + 1 < boundaries.length ? boundaries[b + 1] : sentences.length
    groups.push(sentences.slice(start, end))
    groupSentenceIndices.push(Array.from({ length: end - start }, (_, i) => start + i))
  }

  return buildSemanticChunks(groups, groupSentenceIndices, headingMap, options.maxTokens, sections)
}

/**
 * Builds chunks from semantic sentence groups, respecting maxTokens.
 * Uses pre-computed headingMap for accurate heading tracking across sentence boundaries.
 */
function buildSemanticChunks(
  groups: string[][],
  groupSentenceIndices: number[][],
  headingMap: Map<number, string[]>,
  maxTokens: number,
  sections: Array<{ headingPath: string[]; text: string }>
): TextChunk[] {
  const chunks: TextChunk[] = []
  let currentSentences: string[] = []
  let currentTokens = 0
  let headingStack: string[] = []
  let currentSentenceIndices: number[] = []

  const flush = () => {
    if (currentSentences.length === 0) return
    const content = currentSentences.join(' ')

    // Use pre-computed heading map for accurate heading tracking
    for (const idx of currentSentenceIndices) {
      const headings = headingMap.get(idx)
      if (headings) {
        headingStack = headings
      }
    }

    chunks.push({
      content,
      position: chunks.length,
      tokenCount: estimateTokens(content),
      headingHierarchy: [...headingStack],
      parentSection: findParentSection(sections, headingStack),
    })
    currentSentences = []
    currentSentenceIndices = []
    currentTokens = 0
  }

  for (let g = 0; g < groups.length; g++) {
    // At group boundary (semantic break), flush accumulated sentences
    if (g > 0 && currentSentences.length > 0) {
      flush()
    }

    for (let s = 0; s < groups[g].length; s++) {
      const sentence = groups[g][s]
      const sentenceIdx = groupSentenceIndices[g][s]
      const sentenceTokens = estimateTokens(sentence)

      // If adding this sentence exceeds maxTokens, flush current chunk
      if (currentTokens + sentenceTokens > maxTokens && currentSentences.length > 0) {
        flush()
      }

      currentSentences.push(sentence)
      currentSentenceIndices.push(sentenceIdx)
      currentTokens += sentenceTokens
    }
  }

  // Flush remaining sentences
  flush()

  return chunks
}
