import { describe, it, expect, vi, beforeEach } from 'vitest'
import { XLSXParser } from '../src/index.js'

vi.mock('xlsx', () => ({
  read: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
  },
}))

describe('XLSXParser', () => {
  let parser: XLSXParser

  beforeEach(async () => {
    parser = new XLSXParser()
    await parser.setup({ config: {}, dataDir: '/tmp', log: console as any })
  })

  it('has correct metadata', () => {
    expect(parser.name).toBe('@opendocuments/parser-xlsx')
    expect(parser.supportedTypes).toEqual(['.xlsx', '.xls', '.csv'])
  })

  it('parses spreadsheet into table chunks', async () => {
    const XLSX = await import('xlsx')
    ;(XLSX.read as any).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    })
    ;(XLSX.utils.sheet_to_json as any).mockReturnValue([
      ['Name', 'Age', 'City'],
      ['Alice', '30', 'NYC'],
      ['Bob', '25', 'LA'],
    ])

    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'test.xlsx', content: Buffer.from('fake') })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(1)
    expect(chunks[0].chunkType).toBe('table')
    expect(chunks[0].content).toContain('Name')
    expect(chunks[0].content).toContain('Alice')
  })

  it('handles empty spreadsheet', async () => {
    const XLSX = await import('xlsx')
    ;(XLSX.read as any).mockReturnValue({ SheetNames: [], Sheets: {} })

    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'empty.xlsx', content: Buffer.from('fake') })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })

  it('handles multi-sheet workbook', async () => {
    const XLSX = await import('xlsx')
    ;(XLSX.read as any).mockReturnValue({
      SheetNames: ['Sales', 'Expenses'],
      Sheets: { Sales: {}, Expenses: {} },
    })
    ;(XLSX.utils.sheet_to_json as any)
      .mockReturnValueOnce([['Month', 'Amount'], ['Jan', '100']])
      .mockReturnValueOnce([['Category', 'Amount'], ['Rent', '500']])

    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'multi.xlsx', content: Buffer.from('fake') })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(2)
  })

  it('uses token-aware row groups for wide spreadsheets', async () => {
    const XLSX = await import('xlsx')
    ;(XLSX.read as any).mockReturnValue({
      SheetNames: ['Wide'],
      Sheets: { Wide: {} },
    })
    ;(XLSX.utils.sheet_to_json as any).mockReturnValue([
      ['ID', 'Description'],
      ...Array.from({ length: 12 }, (_, i) => [`row-${i}`, 'wide value '.repeat(120)]),
    ])

    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'wide.xlsx', content: Buffer.from('fake') })) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(chunk => chunk.content.includes('ID | Description'))).toBe(true)
    expect(chunks.every(chunk => chunk.metadata.sheet === 'Wide')).toBe(true)
  })

  it('reports healthy', async () => {
    expect((await parser.healthCheck()).healthy).toBe(true)
  })
})
