import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DOCXParser } from '../src/index.js'

vi.mock('mammoth', () => ({
  extractRawText: vi.fn(),
}))

describe('DOCXParser', () => {
  let parser: DOCXParser

  beforeEach(async () => {
    parser = new DOCXParser()
    await parser.setup({ config: {}, dataDir: '/tmp', log: console as any })
  })

  it('has correct metadata', () => {
    expect(parser.name).toBe('@opendocs/parser-docx')
    expect(parser.supportedTypes).toEqual(['.docx'])
  })

  it('parses DOCX text into chunks', async () => {
    const mammoth = await import('mammoth')
    ;(mammoth.extractRawText as any).mockResolvedValue({ value: 'Hello world\n\nSecond paragraph' })

    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'test.docx', content: Buffer.from('fake') })) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks[0].content).toContain('Hello')
  })

  it('handles empty DOCX', async () => {
    const mammoth = await import('mammoth')
    ;(mammoth.extractRawText as any).mockResolvedValue({ value: '' })

    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'empty.docx', content: Buffer.from('fake') })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })

  it('reports healthy', async () => {
    expect((await parser.healthCheck()).healthy).toBe(true)
  })
})
