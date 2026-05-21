import { describe, it, expect } from 'vitest'
import { selectChunkStrategy, type ChunkStrategy } from '../../src/ingest/chunk-strategies.js'

describe('selectChunkStrategy', () => {
  const cases: Array<{ fileType: string; chunkType: string; expected: ChunkStrategy }> = [
    { fileType: '.md',   chunkType: 'semantic',     expected: 'markdown' },
    { fileType: '.mdx',  chunkType: 'semantic',     expected: 'markdown' },
    { fileType: '.markdown', chunkType: 'semantic', expected: 'markdown' },
    { fileType: '.ts',   chunkType: 'code-ast',     expected: 'code' },
    { fileType: '.py',   chunkType: 'code-ast',     expected: 'code' },
    { fileType: '.ts',   chunkType: 'semantic',     expected: 'code' }, // ext wins for code files
    { fileType: '.csv',  chunkType: 'table',        expected: 'table' },
    { fileType: '.xlsx', chunkType: 'table',        expected: 'table' },
    { fileType: '.json', chunkType: 'semantic',     expected: 'data' },
    { fileType: '.yaml', chunkType: 'semantic',     expected: 'data' },
    { fileType: '.yml',  chunkType: 'semantic',     expected: 'data' },
    { fileType: '.toml', chunkType: 'semantic',     expected: 'data' },
    { fileType: '.txt',  chunkType: 'semantic',     expected: 'prose' },
    { fileType: '',      chunkType: 'semantic',     expected: 'prose' },
    { fileType: '',      chunkType: 'api-endpoint', expected: 'api' },
    { fileType: '.md',   chunkType: 'api-endpoint', expected: 'api' }, // chunkType wins for api
    { fileType: '.MD',   chunkType: 'semantic',     expected: 'markdown' }, // case-insensitive
  ]
  for (const c of cases) {
    it(`picks ${c.expected} for fileType='${c.fileType}', chunkType='${c.chunkType}'`, () => {
      expect(selectChunkStrategy(c.fileType, c.chunkType)).toBe(c.expected)
    })
  }
})
