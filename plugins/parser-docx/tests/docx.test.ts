import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DOCXParser } from '../src/index.js'

vi.mock('mammoth', () => ({
  convertToHtml: vi.fn(),
}))

describe('DOCXParser', () => {
  let parser: DOCXParser

  beforeEach(async () => {
    parser = new DOCXParser()
    await parser.setup({ config: {}, dataDir: '/tmp', log: console as any })
  })

  it('has correct metadata', () => {
    expect(parser.name).toBe('@opendocuments/parser-docx')
    expect(parser.supportedTypes).toEqual(['.docx'])
  })

  it('parses DOCX HTML into chunks with headings', async () => {
    const mammoth = await import('mammoth')
    ;(mammoth.convertToHtml as any).mockResolvedValue({
      value: '<h1>Title</h1><p>Hello world</p><p>Second paragraph</p>',
    })

    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'test.docx', content: Buffer.from('fake') })) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    expect(chunks[0].content).toContain('Hello')
    expect(chunks[0].headingHierarchy).toContain('Title')
  })

  it('handles empty DOCX', async () => {
    const mammoth = await import('mammoth')
    ;(mammoth.convertToHtml as any).mockResolvedValue({ value: '' })

    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'empty.docx', content: Buffer.from('fake') })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })

  it('detects code blocks', async () => {
    const mammoth = await import('mammoth')
    ;(mammoth.convertToHtml as any).mockResolvedValue({
      value: '<pre>const x = 1;</pre>',
    })

    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'code.docx', content: Buffer.from('fake') })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(1)
    expect(chunks[0].chunkType).toBe('code-ast')
    expect(chunks[0].content).toContain('const x = 1;')
  })

  it('reports healthy', async () => {
    expect((await parser.healthCheck()).healthy).toBe(true)
  })
})
