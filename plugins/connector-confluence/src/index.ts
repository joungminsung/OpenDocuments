import type { ConnectorPlugin, DiscoveredDocument, DocumentRef, RawDocument, PluginContext, HealthStatus } from '@opendocs/core'
import { fetchWithTimeout } from '@opendocs/core'

export interface ConfluenceConfig {
  baseUrl: string    // e.g., https://your-domain.atlassian.net/wiki
  token: string      // API token
  email: string      // User email (for basic auth)
  spaceKey?: string  // Space to crawl
}

export class ConfluenceConnector implements ConnectorPlugin {
  name = '@opendocs/connector-confluence'
  type = 'connector' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'

  private baseUrl = ''
  private authHeader = ''
  private spaceKey = ''

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as unknown as ConfluenceConfig
    this.baseUrl = config.baseUrl || ''
    this.spaceKey = config.spaceKey || ''
    if (config.email && config.token) {
      this.authHeader = 'Basic ' + Buffer.from(`${config.email}:${config.token}`).toString('base64')
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.baseUrl || !this.authHeader) return { healthy: false, message: 'Confluence not configured' }
    try {
      const res = await this.cfFetch('/rest/api/space?limit=1')
      return { healthy: res.ok, message: res.ok ? 'Connected' : `HTTP ${res.status}` }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    let start = 0
    const limit = 50
    let hasMore = true

    while (hasMore) {
      const path = this.spaceKey
        ? `/rest/api/content?spaceKey=${this.spaceKey}&type=page&start=${start}&limit=${limit}&expand=version`
        : `/rest/api/content?type=page&start=${start}&limit=${limit}&expand=version`

      const res = await this.cfFetch(path)
      if (!res.ok) throw new Error(`Confluence API error: ${res.status}`)

      const data = await res.json() as any
      for (const page of data.results || []) {
        yield {
          sourceId: page.id,
          title: page.title,
          sourcePath: `confluence://${page.id}`,
          contentHash: page.version?.number?.toString(),
        }
      }

      hasMore = data.size === limit
      start += limit
    }
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    const res = await this.cfFetch(`/rest/api/content/${ref.sourceId}?expand=body.storage`)
    if (!res.ok) throw new Error(`Confluence content error: ${res.status}`)

    const data = await res.json() as any
    const html = data.body?.storage?.value || ''

    // Strip HTML tags for plain text
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

    return { sourceId: ref.sourceId, title: data.title || ref.sourcePath, content: text }
  }

  private cfFetch(path: string): Promise<Response> {
    return fetchWithTimeout(`${this.baseUrl}${path}`, {
      headers: { 'Authorization': this.authHeader, 'Accept': 'application/json' },
    })
  }
}

export default ConfluenceConnector
