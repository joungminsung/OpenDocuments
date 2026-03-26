import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from '@opendocs/core'

export class HTMLParser implements ParserPlugin {
  name = '@opendocs/parser-html'
  type = 'parser' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  supportedTypes = ['.html', '.htm']

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const cheerio = await import('cheerio')
    const html = typeof raw.content === 'string' ? raw.content : raw.content.toString('utf-8')
    if (!html.trim()) return

    const $ = cheerio.load(html)

    // Remove script and style tags
    $('script, style, nav, footer, header').remove()

    const headings: string[] = []

    // Extract code blocks first
    $('pre code, pre').each((_, el) => {
      const code = $(el).text().trim()
      if (!code) return
      const lang = $(el).attr('class')?.match(/language-(\w+)/)?.[1]
      // We'll handle these in the content flow below
    })

    // Process body content section by section
    const body = $('body').length ? $('body') : $.root()

    // Get text content, preserving structure
    const sections: ParsedChunk[] = []

    body.find('h1, h2, h3, h4, h5, h6, p, pre, ul, ol, table').each((_, el) => {
      const tag = (el as any).tagName?.toLowerCase()

      if (tag?.startsWith('h')) {
        const text = $(el).text().trim()
        const level = parseInt(tag[1])
        while (headings.length >= level) headings.pop()
        headings.push(text)
      } else if (tag === 'pre') {
        const code = $(el).text().trim()
        if (code) {
          const lang = $(el).find('code').attr('class')?.match(/language-(\w+)/)?.[1]
          sections.push({
            content: code,
            chunkType: 'code-ast',
            language: lang,
            headingHierarchy: [...headings],
          })
        }
      } else {
        const text = $(el).text().trim()
        if (text) {
          sections.push({
            content: text,
            chunkType: 'semantic',
            headingHierarchy: [...headings],
          })
        }
      }
    })

    // If no structured content found, fall back to full text
    if (sections.length === 0) {
      const fullText = body.text().trim()
      if (fullText) {
        yield { content: fullText, chunkType: 'semantic', headingHierarchy: [] }
      }
      return
    }

    for (const section of sections) {
      yield section
    }
  }
}

export default HTMLParser
