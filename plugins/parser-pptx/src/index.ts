import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from 'opendocuments-core'
import JSZip from 'jszip'
import type { Readable } from 'node:stream'

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 10_000
const MAX_SLIDES = 2_000
const MAX_SLIDE_XML_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_SLIDE_XML_BYTES = 50 * 1024 * 1024

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
    if (buffer.length > MAX_ARCHIVE_BYTES) {
      throw new Error('PPTX archive exceeds the 100 MB compressed-size limit')
    }

    if (isZip(buffer)) {
      const zip = await JSZip.loadAsync(buffer)
      const entries = Object.keys(zip.files)
      if (entries.length > MAX_ARCHIVE_ENTRIES) {
        throw new Error(`PPTX archive contains too many entries (${entries.length}; max ${MAX_ARCHIVE_ENTRIES})`)
      }
      const slides = entries
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => slideNumber(a) - slideNumber(b))
      if (slides.length > MAX_SLIDES) {
        throw new Error(`PPTX contains too many slides (${slides.length}; max ${MAX_SLIDES})`)
      }

      let totalSlideBytes = 0
      for (const slidePath of slides) {
        const file = zip.file(slidePath)
        if (!file) continue
        const declaredSize = (file as unknown as { _data?: { uncompressedSize?: number } })
          ._data?.uncompressedSize
        if (declaredSize !== undefined && declaredSize > MAX_SLIDE_XML_BYTES) {
          throw new Error(`PPTX slide XML exceeds the 10 MB limit: ${slidePath}`)
        }
        if (
          declaredSize !== undefined
          && totalSlideBytes + declaredSize > MAX_TOTAL_SLIDE_XML_BYTES
        ) {
          throw new Error('PPTX slide XML exceeds the 50 MB total uncompressed-size limit')
        }
        const { text: xml, bytes: actualSize } = await readTextWithLimit(
          file,
          Math.min(MAX_SLIDE_XML_BYTES, MAX_TOTAL_SLIDE_XML_BYTES - totalSlideBytes),
          slidePath
        )
        totalSlideBytes += actualSize
        if (totalSlideBytes > MAX_TOTAL_SLIDE_XML_BYTES) {
          throw new Error('PPTX slide XML exceeds the 50 MB total uncompressed-size limit')
        }
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

async function readTextWithLimit(
  file: JSZip.JSZipObject,
  maxBytes: number,
  path: string
): Promise<{ text: string; bytes: number }> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let settled = false
    const stream = file.nodeStream('nodebuffer') as Readable

    stream.on('data', (value: Buffer | Uint8Array | string) => {
      if (settled) return
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
      bytes += chunk.length
      if (bytes > maxBytes) {
        settled = true
        stream.destroy()
        reject(new Error(`PPTX slide XML exceeds the allowed uncompressed-size limit: ${path}`))
        return
      }
      chunks.push(chunk)
    })
    stream.once('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    stream.once('end', () => {
      if (settled) return
      settled = true
      resolve({ text: Buffer.concat(chunks, bytes).toString('utf-8'), bytes })
    })
  })
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
