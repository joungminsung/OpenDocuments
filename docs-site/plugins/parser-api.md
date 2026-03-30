# Parser Plugin API

Parsers transform raw document content into semantic chunks for indexing.

## Interface

```typescript
interface ParserPlugin extends OpenDocumentsPlugin {
  type: 'parser'
  supportedTypes: string[]  // e.g., ['.pdf', '.docx']
  multimodal?: boolean

  parse(raw: RawDocument): AsyncIterable<ParsedChunk>
}

interface RawDocument {
  sourceId: string
  title: string
  content: string | Buffer
  mimeType?: string
  metadata: Record<string, unknown>
}

interface ParsedChunk {
  content: string
  chunkType: 'semantic' | 'code-ast' | 'table' | 'api-endpoint' | 'slide'
  headingHierarchy?: string[]
  language?: string
  codeSymbols?: string[]
}
```

## Creating a Parser

```bash
opendocuments plugin create my-parser --type parser
```

## Example: HTML Parser

```typescript
import type { ParserPlugin, RawDocument, ParsedChunk, PluginContext } from 'opendocuments-core'

export default class HtmlParser implements ParserPlugin {
  name = '@opendocuments/parser-html'
  type = 'parser' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  supportedTypes = ['.html', '.htm']

  async setup(ctx: PluginContext) {}

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const html = typeof raw.content === 'string'
      ? raw.content
      : raw.content.toString('utf-8')

    // Strip HTML tags, extract text content
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) return

    yield {
      content: text,
      chunkType: 'semantic',
      headingHierarchy: [raw.title],
    }
  }
}
```

## Best Practices

- Use `async *parse()` (async generator) to yield chunks one at a time
- Handle both `string` and `Buffer` content types
- Return empty if content is blank (don't yield empty chunks)
- Set appropriate `chunkType` for structured content (tables, code, etc.)
- Preserve heading hierarchy for better search context
- Use `fetchWithTimeout()` for any network calls (available from core utils)

## Testing

```typescript
import { describe, it, expect } from 'vitest'
import MyParser from '../src/index.js'

describe('MyParser', () => {
  const parser = new MyParser()

  it('parses HTML content', async () => {
    const chunks: ParsedChunk[] = []
    for await (const chunk of parser.parse({
      sourceId: 'test',
      title: 'Test',
      content: '<h1>Hello</h1><p>World</p>',
      metadata: {},
    })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toContain('Hello')
  })
})
```

## Reference Plugins

- `parser-html` (150 lines) - Good starting point, simple cheerio usage
- `parser-code` (200 lines) - Shows multi-language regex AST extraction
- `parser-pdf` (100 lines) - Shows binary Buffer handling
