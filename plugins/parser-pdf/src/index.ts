import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from 'opendocuments-core'

export class PDFParser implements ParserPlugin {
  name = '@opendocuments/parser-pdf'
  type = 'parser' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'
  supportedTypes = ['.pdf']

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const pdfParse = (await import('pdf-parse')).default
    const buffer = typeof raw.content === 'string'
      ? Buffer.from(raw.content, 'utf-8')
      : Buffer.from(raw.content)

    const data = await pdfParse(buffer)

    if (!data.text?.trim()) return

    // Split by page markers or double newlines
    const pages = data.text.split(/\f|\n{3,}/).filter((p: string) => p.trim())

    for (let i = 0; i < pages.length; i++) {
      const content = pages[i].trim()
      if (!content) continue
      yield {
        content,
        chunkType: 'semantic',
        page: i + 1,
        headingHierarchy: [],
      }
    }
  }
}

export default PDFParser
