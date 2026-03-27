# Connector Plugin API

```typescript
interface ConnectorPlugin {
  name: string
  type: 'connector'
  discover(): AsyncIterable<DiscoveredDocument>
  fetch(ref: DocumentRef): Promise<RawDocument>
  watch?(onChange: (event: ChangeEvent) => void): Promise<Disposable>
}
```
