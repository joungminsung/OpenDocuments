import type { ConnectorPlugin, DiscoveredDocument, DocumentRef, RawDocument, PluginContext, HealthStatus } from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'

export interface WebCrawlerConfig {
  urls: string[]
  depth?: number
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
  private depth = 0

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as unknown as WebCrawlerConfig
    this.urls = config.urls || []
    this.headers = config.headers || {}
    this.depth = Math.max(0, config.depth ?? 0)
  }

  async healthCheck(): Promise<HealthStatus> {
    if (this.urls.length === 0) return { healthy: false, message: 'No URLs configured' }
    return { healthy: true, message: `${this.urls.length} URL(s) configured` }
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    const visited = new Set<string>()
    const queue = this.urls.map((url) => ({ url: normalizeUrl(url), depth: 0, seedOrigin: new URL(url).origin }))

    while (queue.length > 0) {
      const item = queue.shift()
      if (!item || visited.has(item.url)) continue
      visited.add(item.url)

      yield toDiscoveredDocument(item.url)

      if (item.depth >= this.depth) continue

      const links = await this.discoverLinks(item.url, item.seedOrigin)
      for (const link of links) {
        if (!visited.has(link)) {
          queue.push({ url: link, depth: item.depth + 1, seedOrigin: item.seedOrigin })
        }
      }
    }
  }

  private async discoverLinks(url: string, seedOrigin: string): Promise<string[]> {
    try {
      const res = await fetchWithTimeout(url, {
        headers: { 'User-Agent': 'OpenDocuments/0.3.0', ...this.headers },
      })
      if (!res.ok) return []
      const html = await res.text()
      const cheerio = await import('cheerio')
      const $ = cheerio.load(html)
      const links = new Set<string>()
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return
        const link = resolveCrawlUrl(href, url, seedOrigin)
        if (link) links.add(link)
      })
      return [...links]
    } catch {
      return []
    }
  }

  async *legacyDiscover(): AsyncIterable<DiscoveredDocument> {
    for (const url of this.urls) {
      yield toDiscoveredDocument(url)
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

function toDiscoveredDocument(url: string): DiscoveredDocument {
  const parsed = new URL(url)
  return {
    sourceId: url,
    title: parsed.hostname + parsed.pathname,
    sourcePath: url,
  }
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url)
  parsed.hash = ''
  return parsed.toString()
}

function resolveCrawlUrl(href: string, baseUrl: string, seedOrigin: string): string | null {
  try {
    const parsed = new URL(href, baseUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.origin !== seedOrigin) return null
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return null
  }
}
