# Model Plugin API

```typescript
interface ModelPlugin {
  name: string
  type: 'model'
  capabilities: { llm?: boolean; embedding?: boolean; reranker?: boolean; vision?: boolean }
  generate?(prompt: string, opts?: GenerateOpts): AsyncIterable<string>
  embed?(texts: string[]): Promise<EmbeddingResult>
}
```
