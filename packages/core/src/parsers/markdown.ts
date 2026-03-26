import type {
  ParserPlugin, RawDocument, ParsedChunk, PluginContext, HealthStatus,
} from '../plugin/interfaces.js'

export class MarkdownParser implements ParserPlugin {
  name = '@opendocs/parser-markdown'
  type = 'parser' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  supportedTypes = ['.md', '.mdx']

  async setup(_ctx: PluginContext): Promise<void> {}
  async teardown(): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> { return { healthy: true } }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const content = typeof raw.content === 'string'
      ? raw.content : raw.content.toString('utf-8')
    if (!content.trim()) return

    const sections = splitByCodeBlocks(content)
    const headings: string[] = []

    for (const section of sections) {
      if (section.type === 'code') {
        yield {
          content: section.content,
          chunkType: 'code-ast',
          language: section.language,
          headingHierarchy: [...headings],
          metadata: { contextBefore: section.contextBefore || '' },
        }
      } else {
        updateHeadings(headings, section.content)
        const trimmed = section.content.trim()
        if (trimmed) {
          yield { content: trimmed, chunkType: 'semantic', headingHierarchy: [...headings] }
        }
      }
    }
  }
}

interface Section {
  type: 'text' | 'code'
  content: string
  language?: string
  contextBefore?: string
}

function splitByCodeBlocks(markdown: string): Section[] {
  const sections: Section[] = []
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    const textBefore = markdown.slice(lastIndex, match.index)
    if (textBefore.trim()) {
      sections.push({ type: 'text', content: textBefore })
    }
    const language = match[1] || undefined
    const codeContent = match[2].trim()
    if (codeContent) {
      const lines = textBefore.trim().split('\n')
      const contextBefore = lines.slice(-2).join('\n')
      sections.push({ type: 'code', content: codeContent, language, contextBefore })
    }
    lastIndex = match.index + match[0].length
  }

  const remaining = markdown.slice(lastIndex)
  if (remaining.trim()) {
    sections.push({ type: 'text', content: remaining })
  }
  return sections
}

function updateHeadings(headings: string[], text: string): void {
  const lines = text.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      const level = match[1].length
      while (headings.length > 0) {
        if (headings.length >= level) headings.pop()
        else break
      }
      headings.push(line.trim().replace(/^#+\s*/, ''))
    }
  }
}
