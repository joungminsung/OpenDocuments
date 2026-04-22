import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from '../plugin/interfaces.js'

export class PlainTextParser implements ParserPlugin {
  name = '@opendocuments/parser-plaintext'
  type = 'parser' as const
  version = '0.3.0'
  coreVersion = '^0.3.0'
  supportedTypes = ['.txt']

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const content = typeof raw.content === 'string'
      ? raw.content : raw.content.toString('utf-8')
    if (!content.trim()) return
    yield { content: content.trim(), chunkType: 'semantic', headingHierarchy: [] }
  }
}
