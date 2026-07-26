import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from 'opendocuments-core'
import JSZip from 'jszip'

const MAX_TABLE_TOKENS = 700
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
const MAX_ARCHIVE_ENTRIES = 10_000
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
const MAX_ENTRY_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
const MAX_SHEETS = 1_000
const MAX_ROWS_PER_SHEET = 100_000
const MAX_CELLS_PER_SHEET = 1_000_000

function estimateTableTokens(text: string): number {
  const cjk = (text.match(/[\u3000-\u9fff\uac00-\ud7af]/g) || []).length
  const nonCjk = text.length - cjk
  return Math.ceil(nonCjk / 4 + cjk / 1.5)
}

export class XLSXParser implements ParserPlugin {
  name = '@opendocuments/parser-xlsx'
  type = 'parser' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'
  supportedTypes = ['.xlsx', '.csv']

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const XLSX = await import('@e965/xlsx')
    const buffer = typeof raw.content === 'string'
      ? Buffer.from(raw.content, 'utf-8')
      : Buffer.from(raw.content)
    if (buffer.length > MAX_ARCHIVE_BYTES) {
      throw new Error('Spreadsheet exceeds the 100 MB input-size limit')
    }
    if (isZip(buffer)) await validateZipArchive(buffer)

    const workbook = XLSX.read(buffer, { type: 'buffer' })
    if (workbook.SheetNames.length > MAX_SHEETS) {
      throw new Error(`Spreadsheet contains too many sheets (${workbook.SheetNames.length}; max ${MAX_SHEETS})`)
    }

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) continue
      const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
      if (range) {
        const rows = range.e.r - range.s.r + 1
        const columns = range.e.c - range.s.c + 1
        if (rows > MAX_ROWS_PER_SHEET || rows * columns > MAX_CELLS_PER_SHEET) {
          throw new Error(
            `Spreadsheet sheet "${sheetName}" exceeds the ${MAX_ROWS_PER_SHEET} row or ${MAX_CELLS_PER_SHEET} cell limit`
          )
        }
      }
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
      }).map((row) => row.map(cellValueToString))
      if (rows.length === 0) continue

      const header = rows[0]
      const headerStr = header.join(' | ')

      let batch: string[][] = []
      let startRow = 1

      const emit = function *(
        currentBatch: string[][],
        currentStartRow: number
      ): Generator<ParsedChunk> {
        if (currentBatch.length === 0) return
        const content = [
          `Sheet: ${sheetName}`,
          headerStr,
          '---',
          ...currentBatch.map(row => row.join(' | ')),
        ].join('\n')

        yield {
          content,
          chunkType: 'table',
          headingHierarchy: [sheetName],
          metadata: {
            sheet: sheetName,
            startRow: currentStartRow,
            endRow: currentStartRow + currentBatch.length - 1,
          },
        }
      }

      for (let i = 1; i < rows.length; i++) {
        const candidate = [...batch, rows[i]]
        const candidateContent = [
          `Sheet: ${sheetName}`,
          headerStr,
          '---',
          ...candidate.map(row => row.join(' | ')),
        ].join('\n')

        if (batch.length > 0 && estimateTableTokens(candidateContent) > MAX_TABLE_TOKENS) {
          yield * emit(batch, startRow)
          batch = []
          startRow = i
        }
        batch.push(rows[i])
      }

      yield * emit(batch, startRow)
    }
  }
}

function isZip(buffer: Buffer): boolean {
  return buffer.length >= 4
    && buffer[0] === 0x50
    && buffer[1] === 0x4b
    && buffer[2] === 0x03
    && buffer[3] === 0x04
}

async function validateZipArchive(buffer: Buffer): Promise<void> {
  const zip = await JSZip.loadAsync(buffer)
  const entries = Object.values(zip.files)
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error(`Spreadsheet archive contains too many entries (${entries.length}; max ${MAX_ARCHIVE_ENTRIES})`)
  }

  let totalSize = 0
  for (const entry of entries) {
    if (entry.dir) continue
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })
      ._data?.uncompressedSize
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) {
      throw new Error('Spreadsheet archive contains an entry with an unverifiable size')
    }
    if (size > MAX_ENTRY_UNCOMPRESSED_BYTES) {
      throw new Error(`Spreadsheet archive entry exceeds the 50 MB limit: ${entry.name}`)
    }
    totalSize += size
    if (totalSize > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      throw new Error('Spreadsheet archive exceeds the 200 MB total uncompressed-size limit')
    }
  }
}

function cellValueToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text
    if ('result' in value) return cellValueToString(value.result)
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part: unknown) => (
          typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string'
            ? part.text
            : ''
        ))
        .join('')
    }
    return JSON.stringify(value)
  }
  return String(value)
}

export default XLSXParser
