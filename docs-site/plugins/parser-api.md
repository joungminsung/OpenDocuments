# Parser Plugin API

Implement the `ParserPlugin` interface:

```typescript
interface ParserPlugin {
  name: string
  type: 'parser'
  supportedTypes: string[]
  parse(raw: RawDocument): AsyncIterable<ParsedChunk>
}
```
