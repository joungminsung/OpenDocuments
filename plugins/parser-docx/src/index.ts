import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from '@opendocuments/core'

export class DOCXParser implements ParserPlugin {
  name = '@opendocuments/parser-docx'
  type = 'parser' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  supportedTypes = ['.docx']

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const mammoth = await import('mammoth')
    const buffer = typeof raw.content === 'string'
      ? Buffer.from(raw.content, 'utf-8')
      : Buffer.from(raw.content)

    // Use HTML conversion to preserve heading structure
    const htmlResult = await mammoth.convertToHtml({ buffer })
    const html = htmlResult.value

    if (!html?.trim()) return

    // Parse HTML with simple regex (no cheerio dependency in this plugin)
    const headings: string[] = []

    // Split by block-level elements
    const blocks = html.split(/<\/(?:p|h[1-6]|pre|ul|ol|table)>/i).filter(b => b.trim())

    for (const block of blocks) {
      // Check for heading tags
      const headingMatch = block.match(/<h([1-6])[^>]*>([\s\S]*?)$/i)
      if (headingMatch) {
        const level = parseInt(headingMatch[1])
        const text = headingMatch[2].replace(/<[^>]+>/g, '').trim()
        if (text) {
          while (headings.length >= level) headings.pop()
          headings.push(text)
        }
        continue
      }

      // Check for code blocks
      const codeMatch = block.match(/<pre[^>]*>([\s\S]*?)$/i)
      if (codeMatch) {
        const code = codeMatch[1].replace(/<[^>]+>/g, '').trim()
        if (code) {
          yield { content: code, chunkType: 'code-ast', headingHierarchy: [...headings] }
        }
        continue
      }

      // Regular paragraph
      const text = block.replace(/<[^>]+>/g, '').trim()
      if (text) {
        yield { content: text, chunkType: 'semantic', headingHierarchy: [...headings] }
      }
    }
  }
}

export default DOCXParser
