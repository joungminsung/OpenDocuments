import { describe, it, expect, beforeEach } from 'vitest'
import { PPTXParser } from '../src/index.js'

describe('PPTXParser', () => {
  let parser: PPTXParser
  beforeEach(async () => {
    parser = new PPTXParser()
    await parser.setup({ config: {}, dataDir: '/tmp', log: console as any })
  })

  it('has correct metadata', () => {
    expect(parser.name).toBe('@opendocuments/parser-pptx')
    expect(parser.supportedTypes).toEqual(['.pptx'])
  })

  it('extracts text from XML-like content', async () => {
    const content = '<p>Slide 1 Title</p><p>Bullet point one</p>'
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'test.pptx', content })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toContain('Slide 1 Title')
    expect(chunks[0].chunkType).toBe('slide')
  })

  it('handles empty content', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'empty.pptx', content: '' })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })
})
