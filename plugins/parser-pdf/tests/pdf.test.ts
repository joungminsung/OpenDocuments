import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PDFParser } from '../src/index.js'

// Mock pdf-parse
vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}))

describe('PDFParser', () => {
  let parser: PDFParser

  beforeEach(async () => {
    parser = new PDFParser()
    await parser.setup({ config: {}, dataDir: '/tmp', log: console as any })
  })

  it('has correct metadata', () => {
    expect(parser.name).toBe('@opendocs/parser-pdf')
    expect(parser.type).toBe('parser')
    expect(parser.supportedTypes).toEqual(['.pdf'])
  })

  it('parses PDF text into page chunks', async () => {
    const pdfParse = (await import('pdf-parse')).default as any
    pdfParse.mockResolvedValue({ text: 'Page 1 content\f\fPage 2 content' })

    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'test.pdf', content: Buffer.from('fake') })) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks[0].chunkType).toBe('semantic')
    expect(chunks[0].page).toBe(1)
  })

  it('handles empty PDF', async () => {
    const pdfParse = (await import('pdf-parse')).default as any
    pdfParse.mockResolvedValue({ text: '' })

    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'empty.pdf', content: Buffer.from('fake') })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })

  it('reports healthy', async () => {
    const status = await parser.healthCheck()
    expect(status.healthy).toBe(true)
  })
})
