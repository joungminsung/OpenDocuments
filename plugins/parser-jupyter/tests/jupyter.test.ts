import { describe, it, expect, beforeEach } from 'vitest'
import { JupyterParser } from '../src/index.js'

const SAMPLE_NOTEBOOK = JSON.stringify({
  cells: [
    { cell_type: 'markdown', source: '# Analysis\n\nThis is a data analysis notebook.' },
    { cell_type: 'code', source: ['import pandas as pd\n', 'df = pd.read_csv("data.csv")'] },
    { cell_type: 'markdown', source: '## Results\n\nThe data shows...' },
    { cell_type: 'code', source: 'print(df.describe())' },
  ],
  metadata: { kernelspec: { language: 'python' } },
})

describe('JupyterParser', () => {
  let parser: JupyterParser

  beforeEach(async () => {
    parser = new JupyterParser()
    await parser.setup({ config: {}, dataDir: '/tmp', log: console as any })
  })

  it('has correct metadata', () => {
    expect(parser.name).toBe('@opendocuments/parser-jupyter')
    expect(parser.supportedTypes).toEqual(['.ipynb'])
  })

  it('parses markdown cells as semantic chunks', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'nb.ipynb', content: SAMPLE_NOTEBOOK })) {
      chunks.push(chunk)
    }
    const semantic = chunks.filter(c => c.chunkType === 'semantic')
    expect(semantic.length).toBe(2)
    expect(semantic[0].content).toContain('Analysis')
  })

  it('parses code cells as code-ast chunks with language', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'nb.ipynb', content: SAMPLE_NOTEBOOK })) {
      chunks.push(chunk)
    }
    const code = chunks.filter(c => c.chunkType === 'code-ast')
    expect(code.length).toBe(2)
    expect(code[0].language).toBe('python')
    expect(code[0].content).toContain('pandas')
  })

  it('handles empty notebook', async () => {
    const empty = JSON.stringify({ cells: [], metadata: {} })
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'empty.ipynb', content: empty })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })

  it('handles invalid JSON', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({ sourceId: 'test', title: 'bad.ipynb', content: 'not json' })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })
})
