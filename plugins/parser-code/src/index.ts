import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from 'opendocuments-core'

const LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.h': 'cpp', '.hpp': 'cpp',
  '.c': 'c',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
}

// Regex patterns for function/class detection per language group
const PATTERNS: Record<string, RegExp[]> = {
  javascript: [
    /(?:export\s+)?(?:async\s+)?function\s+\w+/,
    /(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\(/,
    /(?:export\s+)?class\s+\w+/,
    /(?:export\s+)?(?:const|let)\s+\w+\s*=\s*\{/,
  ],
  typescript: [
    /(?:export\s+)?(?:async\s+)?function\s+\w+/,
    /(?:export\s+)?(?:const|let)\s+\w+\s*=\s*(?:async\s*)?\(/,
    /(?:export\s+)?(?:class|interface|type|enum)\s+\w+/,
  ],
  python: [
    /^(?:async\s+)?def\s+\w+/m,
    /^class\s+\w+/m,
  ],
  java: [
    /(?:public|private|protected)\s+(?:static\s+)?(?:class|interface|enum)\s+\w+/,
    /(?:public|private|protected)\s+(?:static\s+)?(?:\w+\s+)+\w+\s*\(/,
  ],
  go: [
    /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?\w+/m,
    /^type\s+\w+\s+struct/m,
    /^type\s+\w+\s+interface/m,
  ],
  rust: [
    /(?:pub\s+)?fn\s+\w+/,
    /(?:pub\s+)?struct\s+\w+/,
    /(?:pub\s+)?enum\s+\w+/,
    /(?:pub\s+)?trait\s+\w+/,
    /impl\s+(?:\w+\s+for\s+)?\w+/,
  ],
}

export class CodeParser implements ParserPlugin {
  name = '@opendocuments/parser-code'
  type = 'parser' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'
  supportedTypes = Object.keys(LANGUAGE_MAP)

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const content = typeof raw.content === 'string' ? raw.content : raw.content.toString('utf-8')
    if (!content.trim()) return

    // Detect language from file extension
    const ext = '.' + (raw.title || '').split('.').pop()?.toLowerCase()
    const language = LANGUAGE_MAP[ext] || 'unknown'

    // Extract imports
    const imports = extractImports(content, language)

    // Try to split into logical blocks (functions/classes)
    const blocks = splitIntoBlocks(content, language)

    if (blocks.length > 1) {
      for (const block of blocks) {
        const symbols = extractSymbols(block.content, language)
        yield {
          content: block.content,
          chunkType: 'code-ast',
          language,
          codeSymbols: symbols,
          codeImports: block.isFirst ? imports : undefined,
          headingHierarchy: symbols.length > 0 ? [symbols[0]] : [],
        }
      }
    } else {
      // Single chunk for the whole file
      yield {
        content: content.trim(),
        chunkType: 'code-ast',
        language,
        codeSymbols: extractSymbols(content, language),
        codeImports: imports,
        headingHierarchy: [],
      }
    }
  }
}

interface CodeBlock {
  content: string
  isFirst: boolean
}

function splitIntoBlocks(content: string, language: string): CodeBlock[] {
  const lines = content.split('\n')
  const blocks: CodeBlock[] = []
  const langGroup = language === 'typescript' ? 'typescript' :
                     language === 'javascript' ? 'javascript' :
                     language === 'python' ? 'python' :
                     language === 'java' ? 'java' :
                     language === 'go' ? 'go' :
                     language === 'rust' ? 'rust' : null

  if (!langGroup || !PATTERNS[langGroup]) {
    return [{ content: content.trim(), isFirst: true }]
  }

  const patterns = PATTERNS[langGroup]
  let currentBlock: string[] = []
  let blockCount = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isDefinitionStart = patterns.some(p => p.test(line))

    if (isDefinitionStart && currentBlock.length > 5) {
      blocks.push({ content: currentBlock.join('\n').trim(), isFirst: blockCount === 0 })
      blockCount++
      currentBlock = []
    }
    currentBlock.push(line)
  }

  if (currentBlock.length > 0) {
    blocks.push({ content: currentBlock.join('\n').trim(), isFirst: blockCount === 0 })
  }

  return blocks
}

function extractImports(content: string, language: string): string[] {
  const imports: string[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('import ') || trimmed.startsWith('from ') ||
        trimmed.startsWith('require(') || trimmed.startsWith('const ') && trimmed.includes('require(') ||
        trimmed.startsWith('#include') || trimmed.startsWith('using ') ||
        trimmed.startsWith('use ')) {
      imports.push(trimmed)
    }
    // Stop looking after first non-import, non-blank, non-comment line
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('#') && !trimmed.startsWith('/*') &&
        !trimmed.startsWith('import') && !trimmed.startsWith('from') && !trimmed.startsWith('require') &&
        !trimmed.startsWith('const') && !trimmed.startsWith('#include') && !trimmed.startsWith('use') &&
        !trimmed.startsWith('using') && imports.length > 0) {
      break
    }
  }

  return imports
}

function extractSymbols(content: string, language: string): string[] {
  const symbols: string[] = []
  const funcPattern = /(?:function|def|func|fn)\s+(\w+)/g
  const classPattern = /(?:class|struct|interface|trait|enum|type)\s+(\w+)/g

  let match
  while ((match = funcPattern.exec(content))) symbols.push(match[1])
  while ((match = classPattern.exec(content))) symbols.push(match[1])

  return [...new Set(symbols)]
}

export default CodeParser
