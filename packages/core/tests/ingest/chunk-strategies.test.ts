import { describe, it, expect } from 'vitest'
import { dispatchChunk, selectChunkStrategy, type ChunkStrategy } from '../../src/ingest/chunk-strategies.js'

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
    { fileType: '.pptx', chunkType: 'slide',        expected: 'slide' },
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

describe('dispatchChunk', () => {
  it('splits oversized code chunks at symbol boundaries instead of embedding whole files', async () => {
    const code = Array.from({ length: 18 }, (_, i) => [
      `export function handler${i}() {`,
      `  const value = '${'x'.repeat(120)}'`,
      '  return value',
      '}',
    ].join('\n')).join('\n\n')

    const chunks = await dispatchChunk(code, {
      fileType: '.ts',
      chunkType: 'code-ast',
      embed: null,
    })

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(400)
    }
  })

  it('splits a single oversized code line within the token budget', async () => {
    const code = `const payload = "${'very long token group '.repeat(900)}"`

    const chunks = await dispatchChunk(code, {
      fileType: '.ts',
      chunkType: 'code-ast',
      embed: null,
    })

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(400)
    }
  })

  it('splits oversized table chunks by rows while repeating the header', async () => {
    const rows = [
      'Sheet: Sales',
      'Name | Notes',
      '---',
      ...Array.from({ length: 60 }, (_, i) => `Customer ${i} | ${'large cell '.repeat(20)}`),
    ]

    const chunks = await dispatchChunk(rows.join('\n'), {
      fileType: '.xlsx',
      chunkType: 'table',
      embed: null,
    })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.content.includes('Name | Notes'))).toBe(true)
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(800)
    }
  })

  it('splits a single oversized table row while repeating the header', async () => {
    const table = [
      'Sheet: Sales',
      'Name | Notes',
      '---',
      `Customer 1 | ${'very wide cell '.repeat(800)}`,
    ].join('\n')

    const chunks = await dispatchChunk(table, {
      fileType: '.xlsx',
      chunkType: 'table',
      embed: null,
    })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.content.includes('Name | Notes'))).toBe(true)
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(800)
    }
  })
})
