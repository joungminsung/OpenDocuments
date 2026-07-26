import { describe, it, expect, beforeEach } from 'vitest'
import { XLSXParser } from '../src/index.js'
import * as XLSX from '@e965/xlsx'
import type { ParsedChunk } from 'opendocuments-core'

async function workbookBuffer(
  sheets: Array<{ name: string; rows: string[][] }>
): Promise<Buffer> {
  const workbook = XLSX.utils.book_new()
  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name)
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

describe('XLSXParser', () => {
  let parser: XLSXParser

  beforeEach(async () => {
    parser = new XLSXParser()
    await parser.setup({ config: {}, dataDir: '/tmp', log: console as any })
  })

  it('has correct metadata', () => {
    expect(parser.name).toBe('@opendocuments/parser-xlsx')
    expect(parser.supportedTypes).toEqual(['.xlsx', '.csv'])
  })

  it('parses spreadsheet into table chunks', async () => {
    const content = await workbookBuffer([{
      name: 'Sheet1',
      rows: [
        ['Name', 'Age', 'City'],
        ['Alice', '30', 'NYC'],
        ['Bob', '25', 'LA'],
      ],
    }])

    const chunks: ParsedChunk[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'test.xlsx', content })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(1)
    expect(chunks[0].chunkType).toBe('table')
    expect(chunks[0].content).toContain('Name')
    expect(chunks[0].content).toContain('Alice')
  })

  it('handles empty spreadsheet', async () => {
    const content = await workbookBuffer([{ name: 'Empty', rows: [] }])

    const chunks: ParsedChunk[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'empty.xlsx', content })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })

  it('handles multi-sheet workbook', async () => {
    const content = await workbookBuffer([
      { name: 'Sales', rows: [['Month', 'Amount'], ['Jan', '100']] },
      { name: 'Expenses', rows: [['Category', 'Amount'], ['Rent', '500']] },
    ])

    const chunks: ParsedChunk[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'multi.xlsx', content })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(2)
  })

  it('uses token-aware row groups for wide spreadsheets', async () => {
    const content = await workbookBuffer([{
      name: 'Wide',
      rows: [
        ['ID', 'Description'],
        ...Array.from({ length: 12 }, (_, i) => [`row-${i}`, 'wide value '.repeat(120)]),
      ],
    }])

    const chunks: ParsedChunk[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'wide.xlsx', content })) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.content.includes('ID | Description'))).toBe(true)
    expect(chunks.every(chunk => chunk.metadata.sheet === 'Wide')).toBe(true)
  })

  it('parses CSV input without the legacy xlsx dependency', async () => {
    const chunks: ParsedChunk[] = []
    for await (const chunk of parser.parse({
      sourceId: 'test',
      title: 'people.csv',
      content: 'Name,Role\nAlice,Engineer\n',
      mimeType: 'text/csv',
    })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toContain('Alice | Engineer')
  })

  it('reports healthy', async () => {
    expect((await parser.healthCheck()).healthy).toBe(true)
  })
})
