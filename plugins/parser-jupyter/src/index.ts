import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from '@opendocs/core'

interface NotebookCell {
  cell_type: 'code' | 'markdown' | 'raw'
  source: string | string[]
  metadata?: Record<string, unknown>
  outputs?: unknown[]
}

interface Notebook {
  cells: NotebookCell[]
  metadata?: {
    kernelspec?: { language?: string; display_name?: string }
    language_info?: { name?: string }
  }
}

export class JupyterParser implements ParserPlugin {
  name = '@opendocs/parser-jupyter'
  type = 'parser' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  supportedTypes = ['.ipynb']

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const content = typeof raw.content === 'string' ? raw.content : raw.content.toString('utf-8')
    if (!content.trim()) return

    let notebook: Notebook
    try {
      notebook = JSON.parse(content)
    } catch {
      return
    }

    if (!notebook.cells || !Array.isArray(notebook.cells)) return

    const language = notebook.metadata?.kernelspec?.language
      || notebook.metadata?.language_info?.name
      || 'python'

    for (const cell of notebook.cells) {
      const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source
      const trimmed = source.trim()
      if (!trimmed) continue

      if (cell.cell_type === 'code') {
        yield {
          content: trimmed,
          chunkType: 'code-ast',
          language,
          headingHierarchy: [],
        }
      } else if (cell.cell_type === 'markdown') {
        yield {
          content: trimmed,
          chunkType: 'semantic',
          headingHierarchy: [],
        }
      }
    }
  }
}

export default JupyterParser
