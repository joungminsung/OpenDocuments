import { describe, it, expect, beforeEach } from 'vitest'
import { HTMLParser } from '../src/index.js'

describe('HTMLParser', () => {
  let parser: HTMLParser

  beforeEach(async () => {
    parser = new HTMLParser()
    await parser.setup({ config: {}, dataDir: '/tmp', log: console as any })
  })

  it('has correct metadata', () => {
    expect(parser.name).toBe('@opendocuments/parser-html')
    expect(parser.supportedTypes).toEqual(['.html', '.htm'])
  })

  it('extracts text from HTML', async () => {
    const html = '<html><body><h1>Title</h1><p>Hello world</p></body></html>'
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'test.html', content: html })) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.some(c => c.content.includes('Hello'))).toBe(true)
  })

  it('separates code blocks', async () => {
    const html = '<html><body><p>Text</p><pre><code class="language-js">const x = 1</code></pre></body></html>'
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'test.html', content: html })) {
      chunks.push(chunk)
    }
    const code = chunks.find(c => c.chunkType === 'code-ast')
    expect(code).toBeDefined()
    expect(code.language).toBe('js')
  })

  it('handles empty HTML', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'empty.html', content: '' })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })

  it('reports healthy', async () => {
    expect((await parser.healthCheck()).healthy).toBe(true)
  })
})
