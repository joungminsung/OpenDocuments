import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from 'opendocuments-core'

const MAX_TABLE_TOKENS = 700

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
  supportedTypes = ['.xlsx', '.xls', '.csv']

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const XLSX = await import('xlsx')
    const buffer = typeof raw.content === 'string'
      ? Buffer.from(raw.content, 'utf-8')
      : Buffer.from(raw.content)

    const workbook = XLSX.read(buffer, { type: 'buffer' })

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) continue

      // Convert to array of arrays
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
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

export default XLSXParser
