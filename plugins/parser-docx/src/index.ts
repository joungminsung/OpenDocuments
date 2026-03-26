import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from '@opendocs/core'

export class DOCXParser implements ParserPlugin {
  name = '@opendocs/parser-docx'
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

    const result = await mammoth.extractRawText({ buffer })
    const text = result.value?.trim()

    if (!text) return

    // Split into paragraphs
    const paragraphs = text.split(/\n{2,}/).filter((p: string) => p.trim())
    const headings: string[] = []

    for (const para of paragraphs) {
      // Detect heading-like text (short lines, all caps or numbered)
      const trimmed = para.trim()
      if (trimmed.length < 100 && (trimmed === trimmed.toUpperCase() || /^\d+[\.\)]\s/.test(trimmed))) {
        headings.push(trimmed)
      }

      yield {
        content: trimmed,
        chunkType: 'semantic',
        headingHierarchy: [...headings],
      }
    }
  }
}

export default DOCXParser
