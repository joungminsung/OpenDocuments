import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from 'opendocuments-core'
import JSZip from 'jszip'

export class PPTXParser implements ParserPlugin {
  name = '@opendocuments/parser-pptx'
  type = 'parser' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'
  supportedTypes = ['.pptx']

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const buffer = typeof raw.content === 'string'
      ? Buffer.from(raw.content, 'utf-8')
      : Buffer.from(raw.content)

    if (buffer.length === 0) return

    if (isZip(buffer)) {
      const zip = await JSZip.loadAsync(buffer)
      const slides = Object.keys(zip.files)
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => slideNumber(a) - slideNumber(b))

      for (const slidePath of slides) {
        const file = zip.file(slidePath)
        if (!file) continue
        const xml = await file.async('string')
        const text = extractText(xml)
        if (!text) continue
        const slide = slideNumber(slidePath)
        yield {
          content: text,
          chunkType: 'slide',
          headingHierarchy: [raw.title || 'Presentation', `Slide ${slide}`],
          metadata: { format: 'pptx', slide },
        }
      }
      return
    }

    const content = buffer.toString('utf-8')
    const text = extractText(content)
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

function isZip(buffer: Buffer): boolean {
  return buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
}

function slideNumber(path: string): number {
  return Number(path.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function extractText(xml: string): string {
  const runs = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
    .map(match => decodeXmlEntities(match[1]).trim())
    .filter(Boolean)

  const text = runs.length > 0
    ? runs.join('\n')
    : xml.replace(/<[^>]+>/g, ' ')

  return decodeXmlEntities(text).replace(/\s+/g, ' ').trim()
}

export default PPTXParser
