import { describe, it, expect } from 'vitest'
import { MarkdownParser } from '../../src/parsers/markdown.js'

describe('MarkdownParser', () => {
  const parser = new MarkdownParser()

  it('has correct plugin metadata', () => {
    expect(parser.name).toBe('@opendocuments/parser-markdown')
    expect(parser.type).toBe('parser')
    expect(parser.supportedTypes).toEqual(['.md', '.mdx'])
  })

  it('parses plain text into semantic chunks', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({
      sourceId: 'test',
      title: 'test.md',
      content: '# Hello\n\nThis is a paragraph.\n\n## World\n\nAnother paragraph.',
      mimeType: 'text/markdown',
    })) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks[0].chunkType).toBe('semantic')
  })

  it('separates code blocks as code-ast chunks', async () => {
    const md = '# Setup\n\nInstall the package:\n\n```javascript\nconst x = 1;\nconsole.log(x);\n```\n\nThen run it.'
    const chunks: any[] = []
    for await (const chunk of parser.parse({
      sourceId: 'test', title: 'test.md', content: md,
    })) {
      chunks.push(chunk)
    }
    const codeChunks = chunks.filter(c => c.chunkType === 'code-ast')
    expect(codeChunks.length).toBeGreaterThanOrEqual(1)
    expect(codeChunks[0].language).toBe('javascript')
    expect(codeChunks[0].content).toContain('const x = 1')
  })

  it('handles empty content', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({
      sourceId: 'test', title: 'empty.md', content: '',
    })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })
})
