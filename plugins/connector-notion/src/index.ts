import type { ConnectorPlugin, DiscoveredDocument, DocumentRef, RawDocument, PluginContext, HealthStatus } from '@opendocuments/core'
import { fetchWithTimeout } from '@opendocuments/core'

export interface NotionConfig {
  token?: string
  rootPageId?: string
  syncInterval?: number
}

export class NotionConnector implements ConnectorPlugin {
  name = '@opendocuments/connector-notion'
  type = 'connector' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'

  private token = ''
  private baseUrl = 'https://api.notion.com/v1'

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as NotionConfig
    this.token = config.token || process.env.NOTION_TOKEN || ''
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.token) return { healthy: false, message: 'NOTION_TOKEN not set' }
    try {
      const res = await this.notionFetch('/users/me')
      return { healthy: res.ok, message: res.ok ? 'Connected to Notion' : `HTTP ${res.status}` }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    // Search for all pages
    let hasMore = true
    let startCursor: string | undefined

    while (hasMore) {
      const body: any = { filter: { property: 'object', value: 'page' }, page_size: 100 }
      if (startCursor) body.start_cursor = startCursor

      const res = await this.notionFetch('/search', {
        method: 'POST',
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error(`Notion search error: ${res.status}`)
      const data = await res.json() as {
        results: { id: string; object: string; properties?: any; last_edited_time?: string }[]
        has_more: boolean
        next_cursor?: string
      }

      for (const page of data.results) {
        if (page.object !== 'page') continue

        // Extract title from properties
        let title = 'Untitled'
        if (page.properties) {
          const titleProp = Object.values(page.properties).find(
            (p: any) => p.type === 'title'
          ) as any
          if (titleProp?.title?.[0]?.plain_text) {
            title = titleProp.title[0].plain_text
          }
        }

        yield {
          sourceId: page.id,
          title,
          sourcePath: `notion://${page.id}`,
          contentHash: page.last_edited_time,
        }
      }

      hasMore = data.has_more
      startCursor = data.next_cursor
    }
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    const pageId = ref.sourceId

    // Get all blocks (children) of the page
    const blocks: string[] = []
    let hasMore = true
    let startCursor: string | undefined

    while (hasMore) {
      const url = startCursor
        ? `/blocks/${pageId}/children?start_cursor=${startCursor}&page_size=100`
        : `/blocks/${pageId}/children?page_size=100`

      const res = await this.notionFetch(url)
      if (!res.ok) throw new Error(`Notion blocks error: ${res.status}`)

      const data = await res.json() as {
        results: any[]
        has_more: boolean
        next_cursor?: string
      }

      for (const block of data.results) {
        const text = extractBlockText(block)
        if (text) blocks.push(text)
      }

      hasMore = data.has_more
      startCursor = data.next_cursor
    }

    return {
      sourceId: ref.sourceId,
      title: ref.sourcePath,
      content: blocks.join('\n\n'),
    }
  }

  private notionFetch(path: string, opts: RequestInit = {}): Promise<Response> {
    return fetchWithTimeout(`${this.baseUrl}${path}`, {
      ...opts,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...opts.headers,
      },
    })
  }
}

function extractBlockText(block: any): string {
  const type = block.type
  if (!type) return ''

  const content = block[type]
  if (!content) return ''

  // Text-based blocks
  if (content.rich_text) {
    const text = content.rich_text.map((rt: any) => rt.plain_text).join('')
    if (type === 'heading_1') return `# ${text}`
    if (type === 'heading_2') return `## ${text}`
    if (type === 'heading_3') return `### ${text}`
    if (type === 'bulleted_list_item') return `- ${text}`
    if (type === 'numbered_list_item') return `1. ${text}`
    if (type === 'to_do') return `- [${content.checked ? 'x' : ' '}] ${text}`
    if (type === 'code') return `\`\`\`${content.language || ''}\n${text}\n\`\`\``
    if (type === 'quote') return `> ${text}`
    return text
  }

  // Table
  if (type === 'table') return '[Table]'

  // Divider
  if (type === 'divider') return '---'

  return ''
}

export default NotionConnector
