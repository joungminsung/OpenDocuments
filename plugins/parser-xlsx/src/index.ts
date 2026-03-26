import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from '@opendocs/core'

export class XLSXParser implements ParserPlugin {
  name = '@opendocs/parser-xlsx'
  type = 'parser' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
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

      // Chunk rows in groups (max ~20 rows per chunk)
      const ROWS_PER_CHUNK = 20
      for (let i = 1; i < rows.length; i += ROWS_PER_CHUNK) {
        const batch = rows.slice(i, i + ROWS_PER_CHUNK)
        const content = [
          `Sheet: ${sheetName}`,
          headerStr,
          '---',
          ...batch.map(row => row.join(' | ')),
        ].join('\n')

        yield {
          content,
          chunkType: 'table',
          headingHierarchy: [sheetName],
          metadata: { sheet: sheetName, startRow: i, endRow: Math.min(i + ROWS_PER_CHUNK, rows.length) },
        }
      }
    }
  }
}

export default XLSXParser
