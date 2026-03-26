import { describe, it, expect } from 'vitest'
import { chunkText } from '../../src/ingest/chunker.js'

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
