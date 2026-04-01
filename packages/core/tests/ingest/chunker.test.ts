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
