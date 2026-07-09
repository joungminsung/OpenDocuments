import { describe, it, expect, beforeEach } from 'vitest'
import { PPTXParser } from '../src/index.js'
import JSZip from 'jszip'

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

  it('extracts one chunk per slide from real pptx zip content', async () => {
    const zip = new JSZip()
    zip.file('ppt/slides/slide2.xml', '<p:sld><a:t>Second Slide</a:t><a:t>Later point</a:t></p:sld>')
    zip.file('ppt/slides/slide1.xml', '<p:sld><a:t>First Slide</a:t><a:t>Opening point</a:t></p:sld>')
    const content = await zip.generateAsync({ type: 'nodebuffer' })

    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'deck.pptx', content })) {
      chunks.push(chunk)
    }

    expect(chunks).toHaveLength(2)
    expect(chunks[0].content).toContain('First Slide')
    expect(chunks[0].metadata.slide).toBe(1)
    expect(chunks[1].content).toContain('Second Slide')
    expect(chunks[1].metadata.slide).toBe(2)
  })

  it('handles empty content', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'empty.pptx', content: '' })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })
})
