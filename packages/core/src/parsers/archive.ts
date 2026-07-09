import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from '../plugin/interfaces.js'
import { constants as zlibConstants, inflateRawSync } from 'node:zlib'

const MAX_ARCHIVE_ENTRIES = 1_000
const MAX_ENTRY_UNCOMPRESSED_BYTES = 16 * 1024 * 1024
const MAX_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
const MAX_COMPRESSION_RATIO = 200

function assertSafeEntry(
  entryName: string,
  compressedSize: number,
  uncompressedSize: number,
  totalUncompressedBytes: number
): void {
  if (uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES) {
    throw new Error(`ZIP entry exceeds the 16MB extraction limit: ${entryName}`)
  }
  if (totalUncompressedBytes + uncompressedSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw new Error('ZIP archive exceeds the 64MB total extraction limit')
  }
  if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO) {
    throw new Error(`ZIP entry has an unsafe compression ratio: ${entryName}`)
  }
}

export class ArchiveParser implements ParserPlugin {
  name = '@opendocuments/parser-archive'
  type = 'parser' as const
  version = '0.3.0'
  coreVersion = '^0.3.0'
  supportedTypes = ['.zip']

  async setup(_ctx: PluginContext): Promise<void> {}
  async teardown(): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const buffer = Buffer.isBuffer(raw.content)
      ? raw.content
      : Buffer.from(raw.content)

    let offset = 0
    let yielded = false
    let entryCount = 0
    let totalUncompressedBytes = 0

    while (offset + 30 <= buffer.length) {
      const signature = buffer.readUInt32LE(offset)
      if (signature !== 0x04034b50) break

      const flags = buffer.readUInt16LE(offset + 6)
      const method = buffer.readUInt16LE(offset + 8)
      const compressedSize = buffer.readUInt32LE(offset + 18)
      const uncompressedSize = buffer.readUInt32LE(offset + 22)
      const fileNameLength = buffer.readUInt16LE(offset + 26)
      const extraLength = buffer.readUInt16LE(offset + 28)
      const nameStart = offset + 30
      const dataStart = nameStart + fileNameLength + extraLength

      entryCount++
      if (entryCount > MAX_ARCHIVE_ENTRIES) {
        throw new Error(`ZIP archive exceeds the ${MAX_ARCHIVE_ENTRIES}-entry limit`)
      }

      if (flags & 0x08) {
        break
      }
      if (dataStart + compressedSize > buffer.length) {
        break
      }

      const entryName = buffer.slice(nameStart, nameStart + fileNameLength).toString('utf-8')
      const data = buffer.slice(dataStart, dataStart + compressedSize)
      offset = dataStart + compressedSize

      if (!entryName || entryName.endsWith('/')) continue

      assertSafeEntry(entryName, compressedSize, uncompressedSize, totalUncompressedBytes)

      let content: Buffer
      if (method === 0) {
        content = data
      } else if (method === 8) {
        const remainingBytes = MAX_TOTAL_UNCOMPRESSED_BYTES - totalUncompressedBytes
        content = inflateRawSync(data, {
          finishFlush: zlibConstants.Z_SYNC_FLUSH,
          maxOutputLength: Math.min(MAX_ENTRY_UNCOMPRESSED_BYTES, remainingBytes),
        })
      } else {
        yield {
          content: `[ZIP Entry Skipped] ${entryName}\nUnsupported compression method: ${method}`,
          chunkType: 'semantic',
          headingHierarchy: ['Archive: ' + raw.title, entryName],
          metadata: { type: 'archive-entry', entryName, skipped: true, compressionMethod: method },
        }
        yielded = true
        continue
      }

      if (content.length > MAX_ENTRY_UNCOMPRESSED_BYTES) {
        throw new Error(`ZIP entry exceeds the 16MB extraction limit: ${entryName}`)
      }
      totalUncompressedBytes += content.length
      if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error('ZIP archive exceeds the 64MB total extraction limit')
      }

      yield {
        content: content.toString('utf-8'),
        chunkType: 'semantic',
        headingHierarchy: ['Archive: ' + raw.title, entryName],
        metadata: {
          type: 'archive-entry',
          entryName,
          compressedSize,
          uncompressedSize,
          needsExtraction: false,
        },
      }
      yielded = true
    }

    if (!yielded) {
      yield {
        content: `[ZIP Archive] ${raw.title}\nNo extractable ZIP entries were found.`,
        chunkType: 'semantic',
        headingHierarchy: ['Archive: ' + raw.title],
        metadata: { type: 'archive-empty', needsExtraction: false },
      }
    }
  }
}
