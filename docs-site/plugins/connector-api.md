# Connector Plugin API

Connectors sync documents from external sources into OpenDocuments.

## Interface

```typescript
interface ConnectorPlugin extends OpenDocumentsPlugin {
  type: 'connector'

  discover(): AsyncIterable<DiscoveredDocument>
  fetch(docRef: DocumentRef): Promise<RawDocument>
  watch?(onChange: (event: ChangeEvent) => void): Promise<Disposable>
  auth?(): Promise<AuthResult>
}

interface DiscoveredDocument {
  ref: DocumentRef
  title: string
  contentHash?: string  // For change detection
}

interface DocumentRef {
  id: string
  source: string
  metadata: Record<string, unknown>
}
```

## Creating a Connector

```bash
opendocuments plugin create my-connector --type connector
```

## Example: GitHub Connector

```typescript
import type { ConnectorPlugin, DiscoveredDocument, DocumentRef, RawDocument, PluginContext } from 'opendocuments-core'

export default class GitHubConnector implements ConnectorPlugin {
  name = '@opendocuments/connector-github'
  type = 'connector' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  private token = ''
  private repo = ''

  async setup(ctx: PluginContext) {
    this.token = (ctx.config as any).token || process.env.GITHUB_TOKEN || ''
    this.repo = (ctx.config as any).repo || ''
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    const res = await fetch(
      `https://api.github.com/repos/${this.repo}/contents`,
      { headers: { Authorization: `token ${this.token}` } }
    )
    const files = await res.json()
    for (const file of files) {
      if (file.type === 'file' && file.name.endsWith('.md')) {
        yield {
          ref: { id: file.sha, source: 'github', metadata: { path: file.path } },
          title: file.name,
          contentHash: file.sha,
        }
      }
    }
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    const path = (ref.metadata as any).path
    const res = await fetch(
      `https://api.github.com/repos/${this.repo}/contents/${path}`,
      { headers: { Authorization: `token ${this.token}`, Accept: 'application/vnd.github.raw' } }
    )
    return {
      sourceId: ref.id,
      title: path,
      content: await res.text(),
      metadata: ref.metadata,
    }
  }
}
```

## Best Practices

- Use `contentHash` in `discover()` for efficient change detection
- Implement pagination in `discover()` for large sources
- Handle API rate limits gracefully
- Store auth tokens via `ctx.config`, never hardcode
- Implement `healthCheck()` to verify API connectivity

## Reference Plugins

- `connector-github` (90 lines) - REST API, auth, pagination
- `connector-notion` (120 lines) - Search API, block conversion
- `connector-web-crawler` (80 lines) - Simple URL fetching
