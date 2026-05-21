import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from 'opendocuments-core'

export class PPTXParser implements ParserPlugin {
  name = '@opendocuments/parser-pptx'
  type = 'parser' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'
  supportedTypes = ['.pptx']

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    // PPTX is a ZIP file containing XML slides
    // For a minimal implementation without zip dependencies,
    // we'll try to extract text using a simple buffer-based approach
    const content = typeof raw.content === 'string' ? raw.content : raw.content.toString('utf-8')

    // If content is already text (e.g., converted externally), yield as-is
    if (content.trim()) {
      // Try to extract text between XML tags if it looks like XML
      const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      if (text) {
        yield {
          content: text,
          chunkType: 'slide',
          headingHierarchy: [raw.title || 'Presentation'],
          metadata: { format: 'pptx' },
        }
      }
    }
  }
}

export default PPTXParser
