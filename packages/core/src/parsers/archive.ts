import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from '../plugin/interfaces.js'

// ZIP parsing requires a proper library (adm-zip, unzipper, etc.)
// For now, yield a placeholder indicating archive support is limited

export class ArchiveParser implements ParserPlugin {
  name = '@opendocs/parser-archive'
  type = 'parser' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  supportedTypes = ['.zip']

  async setup(_ctx: PluginContext): Promise<void> {}
  async teardown(): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    // ZIP parsing requires a proper library (adm-zip, unzipper, etc.)
    // For now, yield a placeholder indicating archive support is limited
    yield {
      content: `Archive file: ${raw.title}. Full ZIP extraction requires @opendocs/parser-archive with adm-zip dependency.`,
      chunkType: 'semantic',
      headingHierarchy: ['Archive'],
      metadata: { type: 'archive-placeholder' },
    }
  }
}
