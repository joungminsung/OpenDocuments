import type { ConnectorPlugin, DiscoveredDocument, DocumentRef, RawDocument, PluginContext, HealthStatus } from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'

export interface WebCrawlerConfig {
  urls: string[]
  depth?: number  // not implemented yet, for future use
  syncInterval?: number
  headers?: Record<string, string>  // custom headers (e.g., cookies for auth)
}

export class WebCrawlerConnector implements ConnectorPlugin {
  name = '@opendocuments/connector-web-crawler'
  type = 'connector' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'

  private urls: string[] = []
  private headers: Record<string, string> = {}

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as unknown as WebCrawlerConfig
    this.urls = config.urls || []
    this.headers = config.headers || {}
  }

  async healthCheck(): Promise<HealthStatus> {
    if (this.urls.length === 0) return { healthy: false, message: 'No URLs configured' }
    return { healthy: true, message: `${this.urls.length} URL(s) configured` }
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    for (const url of this.urls) {
      yield {
        sourceId: url,
        title: new URL(url).hostname + new URL(url).pathname,
        sourcePath: url,
      }
    }
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    const res = await fetchWithTimeout(ref.sourcePath, {
      headers: { 'User-Agent': 'OpenDocuments/0.3.0', ...this.headers },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${ref.sourcePath}`)

    const html = await res.text()

    // Extract text using cheerio
    const cheerio = await import('cheerio')
    const $ = cheerio.load(html)
    $('script, style, nav, footer, header, aside').remove()

    const title = $('title').text().trim() || $('h1').first().text().trim() || ref.sourcePath
    const text = $('body').text().replace(/\s+/g, ' ').trim()

    return {
      sourceId: ref.sourceId,
      title,
      content: text,
      mimeType: 'text/html',
    }
  }
}

export default WebCrawlerConnector
