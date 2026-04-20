import { describe, it, expect } from 'vitest'
import { chunkText, semanticChunkText } from '../../src/ingest/chunker.js'
import type { EmbeddingResult } from '../../src/plugin/interfaces.js'

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    const chunks = chunkText('Hello world.', { maxTokens: 512, overlap: 50 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('Hello world.')
    expect(chunks[0].position).toBe(0)
  })

  it('splits text into multiple chunks by paragraph', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `Paragraph ${i}. ${'Lorem ipsum dolor sit amet. '.repeat(10)}`
    ).join('\n\n')
    const chunks = chunkText(paragraphs, { maxTokens: 200, overlap: 30 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(220)
    }
  })

  it('preserves heading hierarchy in metadata (without # markers)', () => {
    const text = '# Main Title\n\n## Sub Section\n\nSome content here.'
    const chunks = chunkText(text, { maxTokens: 512, overlap: 50 })
    // Headings are stored as plain text without leading '#' characters
    expect(chunks[0].headingHierarchy).toContain('Main Title')
    expect(chunks[0].headingHierarchy).not.toContain('# Main Title')
  })

  it('includes overlap between consecutive chunks', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) =>
      `Unique sentence number ${i}. ${'Filler text goes here. '.repeat(8)}`
    ).join('\n\n')
    const chunks = chunkText(paragraphs, { maxTokens: 150, overlap: 30 })
    expect(chunks.length).toBeGreaterThanOrEqual(2)

    // Last paragraph(s) of chunk N should appear at the start of chunk N+1
    const lastParaOfFirst = chunks[0].content.split('\n\n').pop()!
    expect(chunks[1].content).toContain(lastParaOfFirst.substring(0, 20))
  })

  it('assigns sequential positions', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `Paragraph ${i}. ${'Content. '.repeat(20)}`
    ).join('\n\n')
    const chunks = chunkText(paragraphs, { maxTokens: 150, overlap: 30 })
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].position).toBe(i)
    }
  })
})

describe('structure preservation', () => {
  it('never splits inside a fenced code block', () => {
    const big = 'A'.repeat(200) + '\n\n'
    const code = '```ts\n' + Array.from({ length: 50 }, (_, i) => `const x${i} = ${i};`).join('\n') + '\n```'
    const tail = '\n\nTrailing paragraph after code.'
    const chunks = chunkText(big + code + tail, { maxTokens: 200, overlap: 0 })
    const codeChunk = chunks.find(c => c.content.includes('```'))
    expect(codeChunk).toBeDefined()
    // The code fence must open AND close in the same chunk
    const opens = (codeChunk!.content.match(/```/g) || []).length
    expect(opens % 2).toBe(0)
  })

  it('never splits inside a pipe table', () => {
    const table = [
      '| Col1 | Col2 | Col3 |',
      '|------|------|------|',
      ...Array.from({ length: 20 }, (_, i) => `| a${i} | b${i} | c${i} |`),
    ].join('\n')
    const chunks = chunkText(`Intro paragraph.\n\n${table}\n\nOutro paragraph.`, { maxTokens: 80, overlap: 0 })
    const tableChunk = chunks.find(c => c.content.includes('| Col1 |'))
    expect(tableChunk).toBeDefined()
    // All 22 rows (header + separator + 20 data rows) land in one chunk together
    const rowCount = tableChunk!.content.split('\n').filter(l => /^\s*\|/.test(l)).length
    expect(rowCount).toBeGreaterThanOrEqual(22)
  })

  it('keeps a heading attached to the next paragraph', () => {
    const text = '# Section Heading\n\nParagraph under the heading with real content about Redis.'
    const chunks = chunkText(text, { maxTokens: 512, overlap: 0 })
    expect(chunks[0].content).toContain('# Section Heading')
    expect(chunks[0].content).toContain('Redis')
  })

  it('keeps a code block with internal blank lines together (would break the old paragraph splitter)', () => {
    // Old splitter: text.split(/\n{2,}/) treats the blank lines INSIDE the fence as paragraph
    // boundaries, producing multiple fragments and an unbalanced fence count in each chunk.
    const text = [
      'Intro paragraph explaining the snippet.',
      '',
      '```ts',
      'function a() {',
      '  return 1',
      '}',
      '',
      'function b() {',
      '  return 2',
      '}',
      '',
      'function c() {',
      '  return 3',
      '}',
      '```',
      '',
      'Outro paragraph.',
    ].join('\n')
    // Use a small maxTokens so the greedy old splitter is forced to break between
    // the fragments it produces mid-fence. With maxTokens=512, the whole 44-token
    // block fits in one chunk regardless of splitter, so the test wouldn't gate the fix.
    const chunks = chunkText(text, { maxTokens: 20, overlap: 0 })
    const fenced = chunks.filter(c => c.content.includes('```'))
    // Exactly one chunk holds the fence, and it must open and close cleanly
    expect(fenced.length).toBe(1)
    const fenceMatches = (fenced[0].content.match(/```/g) || []).length
    expect(fenceMatches).toBe(2)
    // The interior functions must all be present
    expect(fenced[0].content).toContain('function a()')
    expect(fenced[0].content).toContain('function b()')
    expect(fenced[0].content).toContain('function c()')
  })
})

describe('semanticChunkText', () => {
  const defaultOpts = { maxTokens: 512, overlap: 50 }

  /** Helper: creates an embed function that returns a fixed vector per sentence index */
  function mockEmbedder(vectors: number[][]) {
    return async (texts: string[]): Promise<EmbeddingResult> => {
      const dense = texts.map((_, i) => vectors[i] ?? [1, 0, 0])
      return { dense }
    }
  }

  it('splits text into sentence-based chunks', async () => {
    const text = 'First sentence. Second sentence. Third sentence.'
    // All similar vectors -> one chunk
    const embed = mockEmbedder([
      [1, 0, 0],
      [0.9, 0.1, 0],
      [0.85, 0.15, 0],
    ])
    const chunks = await semanticChunkText(text, defaultOpts, embed)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    // All sentences should appear in the output
    const allContent = chunks.map(c => c.content).join(' ')
    expect(allContent).toContain('First sentence.')
    expect(allContent).toContain('Second sentence.')
    expect(allContent).toContain('Third sentence.')
  })

  it('respects maxTokens limit', async () => {
    // Many sentences with similar embeddings should still split at maxTokens
    const sentences = Array.from({ length: 30 }, (_, i) =>
      `Sentence number ${i} with some extra words to increase token count.`
    )
    const text = sentences.join(' ')
    const embed = mockEmbedder(sentences.map(() => [1, 0, 0]))
    const chunks = await semanticChunkText(text, { maxTokens: 100, overlap: 0 }, embed)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      // Allow some tolerance since we estimate tokens
      expect(chunk.tokenCount).toBeLessThanOrEqual(120)
    }
  })

  it('keeps semantically similar sentences together and splits on dissimilar ones', async () => {
    const text = 'Dogs are great pets. Cats are also wonderful animals. The stock market crashed today. Investors are worried about recession.'
    // First two sentences: similar direction, last two: different direction
    const embed = mockEmbedder([
      [1, 0],      // dogs
      [0.95, 0.05], // cats - similar to dogs
      [0, 1],      // stock market - very different
      [0.05, 0.95], // investors - similar to stock market
    ])
    const chunks = await semanticChunkText(text, defaultOpts, embed, 0.5)
    expect(chunks.length).toBe(2)
    expect(chunks[0].content).toContain('Dogs are great pets.')
    expect(chunks[0].content).toContain('Cats are also wonderful animals.')
    expect(chunks[1].content).toContain('The stock market crashed today.')
    expect(chunks[1].content).toContain('Investors are worried about recession.')
  })

  it('preserves heading hierarchy', async () => {
    const text = '# Introduction\n\nThis is the intro sentence. It has details.\n\n## Methods\n\nWe used method A. We also used method B.'
    const embed = mockEmbedder([
      [1, 0],
      [0.9, 0.1],
      [0, 1],
      [0.1, 0.9],
    ])
    const chunks = await semanticChunkText(text, defaultOpts, embed, 0.5)
    // At least the last chunk should have heading hierarchy
    const lastChunk = chunks[chunks.length - 1]
    const allHeadings = chunks.flatMap(c => c.headingHierarchy)
    expect(allHeadings).toContain('Introduction')
  })

  it('falls back to paragraph chunking when embed is null', async () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
    const chunks = await semanticChunkText(text, defaultOpts, null)
    // Should produce the same result as chunkText
    const fallbackChunks = chunkText(text, defaultOpts)
    expect(chunks).toEqual(fallbackChunks)
  })

  it('falls back to paragraph chunking when embedding fails', async () => {
    const text = 'First sentence. Second sentence.'
    const failingEmbed = async (): Promise<EmbeddingResult> => {
      throw new Error('Embedding service unavailable')
    }
    const chunks = await semanticChunkText(text, defaultOpts, failingEmbed)
    const fallbackChunks = chunkText(text, defaultOpts)
    expect(chunks).toEqual(fallbackChunks)
  })

  it('assigns sequential positions', async () => {
    const text = 'A topic about science. Another science fact. Now about cooking. A great recipe here.'
    const embed = mockEmbedder([
      [1, 0],
      [0.9, 0.1],
      [0, 1],
      [0.1, 0.9],
    ])
    const chunks = await semanticChunkText(text, defaultOpts, embed, 0.5)
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].position).toBe(i)
    }
  })
})
