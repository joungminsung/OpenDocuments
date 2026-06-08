import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus } from 'opendocuments-core'

const ADORNMENT_RE = /^([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])\1+\s*$/

function adornmentChar(line: string): string | null {
  const m = line.match(ADORNMENT_RE)
  return m ? m[1] : null
}

export class RSTParser implements ParserPlugin {
  name = '@opendocuments/parser-rst'
  type = 'parser' as const
  version = '0.1.0'
  coreVersion = '^0.3.0'
  supportedTypes = ['.rst']

  async setup(_ctx: PluginContext): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const text = typeof raw.content === 'string' ? raw.content : raw.content.toString('utf-8')
    if (!text.trim()) return

    const lines = text.split('\n')
    const adornmentLevels = new Map<string, number>()
    let nextLevel = 1
    const headings: string[] = []
    let i = 0

    const levelFor = (char: string): number => {
      if (!adornmentLevels.has(char)) adornmentLevels.set(char, nextLevel++)
      return adornmentLevels.get(char)!
    }

    const currentHierarchy = (): string[] => headings.filter(Boolean)

    const collectIndentedBlock = (): string => {
      const baseIndent = lines[i]?.match(/^(\s+)/)?.[1]?.length ?? 4
      const codeLines: string[] = []
      while (i < lines.length && (lines[i].trim() === '' || /^\s/.test(lines[i]))) {
        codeLines.push(lines[i].replace(new RegExp(`^\\s{0,${baseIndent}}`), ''))
        i++
      }
      while (codeLines.length && !codeLines[codeLines.length - 1].trim()) codeLines.pop()
      return codeLines.join('\n').trim()
    }

    while (i < lines.length) {
      const line = lines[i]
      const trimmed = line.trim()

      if (!trimmed) { i++; continue }

      // Overlined heading: ====, text, ====
      const overChar = adornmentChar(line)
      if (overChar && i + 2 < lines.length) {
        const textLine = lines[i + 1].trim()
        const underChar = adornmentChar(lines[i + 2])
        if (textLine && underChar === overChar && lines[i + 2].trim().length >= textLine.length) {
          const level = levelFor(overChar)
          headings.length = level - 1
          headings[level - 1] = textLine
          i += 3
          continue
        }
      }

      // Underlined heading: text, ====
      if (!overChar && i + 1 < lines.length) {
        const underChar = adornmentChar(lines[i + 1])
        if (underChar && lines[i + 1].trim().length >= trimmed.length) {
          const level = levelFor(underChar)
          headings.length = level - 1
          headings[level - 1] = trimmed
          i += 2
          continue
        }
      }

      // Code block directive: .. code-block:: lang or .. code:: lang
      const codeMatch = trimmed.match(/^\.\.\s+code(?:-block)?::\s*(\w*)/)
      if (codeMatch) {
        const lang = codeMatch[1] || undefined
        i++
        while (i < lines.length && lines[i].match(/^\s+:\w+:/)) i++
        if (i < lines.length && !lines[i].trim()) i++
        const code = collectIndentedBlock()
        if (code) {
          yield { content: code, chunkType: 'code-ast', language: lang, headingHierarchy: currentHierarchy() }
        }
        continue
      }

      // Other directives: skip body
      if (trimmed.match(/^\.\.\s+\w/)) {
        i++
        while (i < lines.length && (/^\s/.test(lines[i]) || !lines[i].trim())) i++
        continue
      }

      // Regular paragraph
      const paraLines: string[] = []
      while (i < lines.length && lines[i].trim()) {
        paraLines.push(lines[i])
        i++
      }
      const lastLine = paraLines[paraLines.length - 1]
      const endsWithDoubleColon = !!lastLine?.trim().endsWith('::')

      if (endsWithDoubleColon) {
        if (lastLine.trim() === '::') {
          paraLines.pop()
        } else {
          paraLines[paraLines.length - 1] = lastLine.replace(/::$/, ':')
        }
      }

      const para = paraLines.join('\n').trim()
      if (para) {
        yield { content: para, chunkType: 'semantic', headingHierarchy: currentHierarchy() }
      }

      // Literal block following ::
      if (endsWithDoubleColon) {
        while (i < lines.length && !lines[i].trim()) i++
        const code = collectIndentedBlock()
        if (code) {
          yield { content: code, chunkType: 'code-ast', headingHierarchy: currentHierarchy() }
        }
      }
    }
  }
}

export default RSTParser
