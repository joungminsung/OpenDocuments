import type { EmbeddingResult } from '../plugin/interfaces.js'
import { chunkText, semanticChunkText, type ChunkOptions, type TextChunk } from './chunker.js'

export type ChunkStrategy = 'markdown' | 'code' | 'table' | 'data' | 'prose' | 'api'

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
}

/**
 * Dispatch chunking based on document strategy.
 * - code / table / api: parsers already produced atomic units — pass through unchanged.
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
    case 'table':
    case 'api':
      return [{
        content,
        position: 0,
        tokenCount: Math.ceil(content.length / 4),
        headingHierarchy: [],
      }]
    case 'markdown':
    case 'prose':
      return ctx.embed
        ? await semanticChunkText(content, opts, ctx.embed)
        : chunkText(content, opts)
    case 'data':
      return chunkText(content, opts)
  }
}
