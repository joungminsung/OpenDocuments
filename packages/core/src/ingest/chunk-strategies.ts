import type { EmbeddingResult } from '../plugin/interfaces.js'
import { chunkText, semanticChunkText, type ChunkOptions, type TextChunk } from './chunker.js'
import { estimateTokens } from '../utils/tokenizer.js'

export type ChunkStrategy = 'markdown' | 'code' | 'table' | 'data' | 'prose' | 'api' | 'slide'

const MARKDOWN_EXT = new Set(['.md', '.mdx', '.markdown'])
const CODE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rs', '.rb', '.php',
  '.cs', '.cpp', '.cc', '.c', '.h', '.hpp',
  '.swift', '.kt', '.scala', '.sh', '.bash', '.zsh',
])
const DATA_EXT = new Set(['.json', '.yaml', '.yml', '.toml', '.xml'])
const TABLE_EXT = new Set(['.csv', '.tsv', '.xlsx', '.xls'])

/**
 * Select a chunking strategy based on file extension and the parser-reported chunkType.
 * Order: explicit chunkType=api beats ext; otherwise ext determines the strategy.
 */
export function selectChunkStrategy(fileType: string, chunkType: string): ChunkStrategy {
  if (chunkType === 'api-endpoint') return 'api'
  if (chunkType === 'slide') return 'slide'
  const ext = (fileType || '').toLowerCase()
  if (chunkType === 'code-ast' || CODE_EXT.has(ext)) return 'code'
  if (chunkType === 'table'    || TABLE_EXT.has(ext)) return 'table'
  if (MARKDOWN_EXT.has(ext)) return 'markdown'
  if (DATA_EXT.has(ext))     return 'data'
  return 'prose'
}

export interface ChunkDispatchContext {
  fileType: string
  chunkType: string
  embed: ((texts: string[]) => Promise<EmbeddingResult>) | null
}

/**
 * Per-strategy budgets. Dense reference material gets smaller chunks;
 * narrative prose gets overlap to preserve coherence across boundaries.
 */
const BUDGETS: Record<ChunkStrategy, ChunkOptions> = {
  markdown: { maxTokens: 600, overlap: 60 },
  code:     { maxTokens: 400, overlap: 0 },
  table:    { maxTokens: 800, overlap: 0 },
  data:     { maxTokens: 400, overlap: 0 },
  prose:    { maxTokens: 512, overlap: 64 },
  api:      { maxTokens: 800, overlap: 0 },
  slide:    { maxTokens: 500, overlap: 0 },
}

/**
 * Dispatch chunking based on document strategy.
 * - code / table / api / slide: preserve parser units when possible, but split oversized units.
 * - markdown / prose: embedding-aware semantic chunking (falls back to paragraph split when no embedder).
 * - data: paragraph chunking only (JSON/YAML blank-line separation preserves top-level keys).
 */
export async function dispatchChunk(
  content: string,
  ctx: ChunkDispatchContext
): Promise<TextChunk[]> {
  const strategy = selectChunkStrategy(ctx.fileType, ctx.chunkType)
  const opts = BUDGETS[strategy]

  switch (strategy) {
    case 'code':
      return splitOversizedCode(content, opts)
    case 'table':
      return splitOversizedTable(content, opts)
    case 'api':
    case 'slide':
      return splitOversizedLines(content, opts)
    case 'markdown':
    case 'prose':
      return ctx.embed
        ? await semanticChunkText(content, opts, ctx.embed)
        : chunkText(content, opts)
    case 'data':
      return chunkText(content, opts)
  }
}

function toTextChunks(chunks: string[]): TextChunk[] {
  return chunks
    .map(content => content.trim())
    .filter(content => content.length > 0)
    .map((content, position) => ({
      content,
      position,
      tokenCount: estimateTokens(content),
      headingHierarchy: [],
    }))
}

function splitOversizedLines(content: string, opts: ChunkOptions): TextChunk[] {
  if (estimateTokens(content) <= opts.maxTokens) return toTextChunks([content])

  const chunks: string[] = []
  let current: string[] = []
  let currentTokens = 0

  const flush = () => {
    if (current.length === 0) return
    chunks.push(current.join('\n'))
    current = []
    currentTokens = 0
  }

  for (const line of content.split('\n')) {
    const lineTokens = estimateTokens(line)
    if (lineTokens > opts.maxTokens) {
      flush()
      chunks.push(...splitTextByTokenBudget(line, opts.maxTokens))
      continue
    }
    if (current.length > 0 && currentTokens + lineTokens > opts.maxTokens) {
      flush()
    }
    current.push(line)
    currentTokens += lineTokens
  }
  flush()

  return toTextChunks(chunks)
}

function splitTextByTokenBudget(text: string, maxTokens: number): string[] {
  const totalTokens = estimateTokens(text)
  if (totalTokens <= maxTokens) return [text]

  const parts = text.includes(' ')
    ? text.split(/(\s+)/).filter(part => part.length > 0)
    : splitByEstimatedCharacterBudget(text, maxTokens, totalTokens)
  const chunks: string[] = []
  let current = ''

  const flush = () => {
    if (!current) return
    chunks.push(current)
    current = ''
  }

  for (const part of parts) {
    const candidate = current + part
    if (current && estimateTokens(candidate) > maxTokens) {
      flush()
    }

    if (estimateTokens(part) <= maxTokens) {
      current += part
      continue
    }

    let remainder = part
    while (estimateTokens(remainder) > maxTokens) {
      let lo = 1
      let hi = remainder.length
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        if (estimateTokens(remainder.slice(0, mid)) <= maxTokens) lo = mid
        else hi = mid - 1
      }
      chunks.push(remainder.slice(0, lo))
      remainder = remainder.slice(lo)
    }
    current = remainder
  }

  flush()
  return chunks
}

function splitByEstimatedCharacterBudget(text: string, maxTokens: number, totalTokens: number): string[] {
  const charsPerToken = text.length / totalTokens
  const targetChars = Math.max(1, Math.floor(maxTokens * charsPerToken * 0.9))
  const chunks: string[] = []
  let index = 0

  while (index < text.length) {
    let end = Math.min(text.length, index + targetChars)
    let candidate = text.slice(index, end)

    while (candidate.length > 1 && estimateTokens(candidate) > maxTokens) {
      end = index + Math.max(1, Math.floor((end - index) * 0.9))
      candidate = text.slice(index, end)
    }

    chunks.push(candidate)
    index = end
  }

  return chunks
}

function splitOversizedCode(content: string, opts: ChunkOptions): TextChunk[] {
  if (estimateTokens(content) <= opts.maxTokens) return toTextChunks([content])

  const lines = content.split('\n')
  const blocks: string[] = []
  let current: string[] = []
  const definitionPattern = /^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|enum|def|func|fn|struct|trait|impl)\b|^\s*(?:export\s+)?(?:const|let|var)\s+\w+\s*=/

  for (const line of lines) {
    if (definitionPattern.test(line) && current.length > 0) {
      blocks.push(current.join('\n'))
      current = []
    }
    current.push(line)
  }
  if (current.length > 0) blocks.push(current.join('\n'))

  const chunks: string[] = []
  let buffer: string[] = []
  let bufferTokens = 0
  const flush = () => {
    if (buffer.length === 0) return
    chunks.push(buffer.join('\n\n'))
    buffer = []
    bufferTokens = 0
  }

  for (const block of blocks) {
    const blockTokens = estimateTokens(block)
    if (blockTokens > opts.maxTokens) {
      flush()
      chunks.push(...splitOversizedLines(block, opts).map(chunk => chunk.content))
      continue
    }
    if (buffer.length > 0 && bufferTokens + blockTokens > opts.maxTokens) {
      flush()
    }
    buffer.push(block)
    bufferTokens += blockTokens
  }
  flush()

  return toTextChunks(chunks)
}

function splitOversizedTable(content: string, opts: ChunkOptions): TextChunk[] {
  if (estimateTokens(content) <= opts.maxTokens) return toTextChunks([content])

  const lines = content.split('\n').filter(line => line.trim().length > 0)
  const separatorIndex = lines.findIndex(line => /^-+$/.test(line.trim()))
  const headerEnd = separatorIndex >= 0 ? separatorIndex + 1 : Math.min(2, lines.length)
  const header = lines.slice(0, headerEnd)
  const rows = lines.slice(headerEnd)
  if (rows.length === 0) return splitOversizedLines(content, opts)

  const chunks: string[] = []
  let currentRows: string[] = []

  const build = (batch: string[]) => [...header, ...batch].join('\n')
  const flush = () => {
    if (currentRows.length === 0) return
    chunks.push(build(currentRows))
    currentRows = []
  }

  for (const row of rows) {
    const candidate = build([...currentRows, row])
    if (currentRows.length > 0 && estimateTokens(candidate) > opts.maxTokens) {
      flush()
    }
    if (currentRows.length === 0 && estimateTokens(build([row])) > opts.maxTokens) {
      const availableTokens = Math.max(1, opts.maxTokens - estimateTokens(header.join('\n')))
      for (const part of splitTextByTokenBudget(row, availableTokens)) {
        chunks.push(build([part]))
      }
      continue
    }
    currentRows.push(row)
  }
  flush()

  return toTextChunks(chunks)
}
