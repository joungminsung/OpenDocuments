import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from '../plugin/interfaces.js'

export class StructuredDataParser implements ParserPlugin {
  name = '@opendocs/parser-structured'
  type = 'parser' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  supportedTypes = ['.json', '.yaml', '.yml', '.toml']

  async setup(_ctx: PluginContext): Promise<void> {}
  async teardown(): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const content = typeof raw.content === 'string' ? raw.content : raw.content.toString('utf-8')
    if (!content.trim()) return

    // For structured data, yield the whole content as a single semantic chunk
    // The content is already human-readable (JSON/YAML/TOML)
    yield {
      content: content.trim(),
      chunkType: 'semantic',
      headingHierarchy: [raw.title || 'Structured Data'],
      metadata: { format: this.detectFormat(raw.title || '') },
    }
  }

  private detectFormat(title: string): string {
    if (title.endsWith('.json')) return 'json'
    if (title.endsWith('.yaml') || title.endsWith('.yml')) return 'yaml'
    if (title.endsWith('.toml')) return 'toml'
    return 'unknown'
  }
}
