import type { ConnectorPlugin, DiscoveredDocument, DocumentRef, RawDocument, PluginContext, HealthStatus } from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'

export interface SlackConfig {
  token?: string
  channels?: string[]    // channel names or IDs to index (default: all public channels)
  maxMessages?: number   // max messages to fetch per channel (default: 1000)
  syncInterval?: number  // seconds
}

interface SlackMessage {
  ts: string
  thread_ts?: string
  user?: string
  username?: string
  text: string
  reply_count?: number
}

interface SlackChannel {
  id: string
  name: string
  is_archived: boolean
  is_member: boolean
}

export class SlackConnector implements ConnectorPlugin {
  name = '@opendocuments/connector-slack'
  type = 'connector' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'

  private token = ''
  private channels: string[] = []
  private maxMessages = 1000
  private baseUrl = 'https://slack.com/api'

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as SlackConfig
    this.token = config.token || process.env.SLACK_BOT_TOKEN || ''
    this.channels = config.channels || []
    this.maxMessages = config.maxMessages ?? 1000
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.token) return { healthy: false, message: 'SLACK_BOT_TOKEN not set' }
    try {
      const res = await this.slackFetch('/auth.test')
      if (!res.ok) return { healthy: false, message: `HTTP ${res.status}` }
      const data = await res.json() as { ok: boolean; error?: string; team?: string }
      return {
        healthy: data.ok,
        message: data.ok ? `Connected to Slack workspace: ${data.team}` : `Slack error: ${data.error}`,
      }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    const allChannels = await this.listChannels()

    for (const channel of allChannels) {
      const messages = await this.fetchChannelMessages(channel.id)

      // Group messages by thread (thread_ts || ts)
      const threads = new Map<string, SlackMessage[]>()
      for (const msg of messages) {
        const threadKey = msg.thread_ts || msg.ts
        const existing = threads.get(threadKey)
        if (existing) {
          existing.push(msg)
        } else {
          threads.set(threadKey, [msg])
        }
      }

      for (const [threadTs, threadMessages] of threads) {
        const rootMessage = threadMessages[0]
        const title = `#${channel.name}: ${rootMessage.text.slice(0, 80)}`
        const sourcePath = `slack://${channel.name}/${threadTs}`

        yield {
          sourceId: `${channel.id}/${threadTs}`,
          title,
          sourcePath,
          contentHash: threadTs,
        }
      }
    }
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    // sourcePath format: slack://channel-name/thread-ts
    // sourceId format: channelId/thread-ts
    const [channelId, threadTs] = ref.sourceId.split('/')

    const res = await this.slackFetch(
      `/conversations.replies?channel=${channelId}&ts=${threadTs}&limit=200`
    )
    if (!res.ok) throw new Error(`Slack replies API error: ${res.status}`)

    const data = await res.json() as { ok: boolean; messages?: SlackMessage[]; error?: string }
    if (!data.ok) throw new Error(`Slack replies error: ${data.error}`)

    const messages = data.messages || []

    // Resolve user display names
    const userIds = [...new Set(messages.map(m => m.user).filter(Boolean))] as string[]
    const userMap = await this.resolveUsers(userIds)

    const lines = messages.map(msg => {
      const displayName = msg.username || userMap.get(msg.user || '') || msg.user || 'Unknown'
      return `[${displayName}]: ${msg.text}`
    })

    const channelName = ref.sourcePath.replace('slack://', '').split('/')[0]
    const title = `#${channelName} thread (${threadTs})`

    return {
      sourceId: ref.sourceId,
      title,
      content: lines.join('\n'),
    }
  }

  private async listChannels(): Promise<SlackChannel[]> {
    const result: SlackChannel[] = []
    let cursor: string | undefined

    do {
      const url = cursor
        ? `/conversations.list?types=public_channel&exclude_archived=true&limit=200&cursor=${cursor}`
        : '/conversations.list?types=public_channel&exclude_archived=true&limit=200'

      const res = await this.slackFetch(url)
      if (!res.ok) throw new Error(`Slack channels API error: ${res.status}`)

      const data = await res.json() as {
        ok: boolean
        channels?: SlackChannel[]
        response_metadata?: { next_cursor?: string }
        error?: string
      }
      if (!data.ok) throw new Error(`Slack channels error: ${data.error}`)

      const channels = data.channels || []

      // Filter by configured channel list if provided
      for (const ch of channels) {
        if (this.channels.length === 0 || this.channels.includes(ch.name) || this.channels.includes(ch.id)) {
          result.push(ch)
        }
      }

      cursor = data.response_metadata?.next_cursor || undefined
    } while (cursor)

    return result
  }

  private async fetchChannelMessages(channelId: string): Promise<SlackMessage[]> {
    const messages: SlackMessage[] = []
    let cursor: string | undefined

    do {
      const remaining = this.maxMessages - messages.length
      if (remaining <= 0) break

      const limit = Math.min(remaining, 200)
      const url = cursor
        ? `/conversations.history?channel=${channelId}&limit=${limit}&cursor=${cursor}`
        : `/conversations.history?channel=${channelId}&limit=${limit}`

      const res = await this.slackFetch(url)
      if (!res.ok) throw new Error(`Slack history API error: ${res.status}`)

      const data = await res.json() as {
        ok: boolean
        messages?: SlackMessage[]
        has_more?: boolean
        response_metadata?: { next_cursor?: string }
        error?: string
      }
      if (!data.ok) throw new Error(`Slack history error: ${data.error}`)

      messages.push(...(data.messages || []))

      cursor = data.has_more ? data.response_metadata?.next_cursor : undefined
    } while (cursor)

    return messages
  }

  private async resolveUsers(userIds: string[]): Promise<Map<string, string>> {
    const userMap = new Map<string, string>()
    for (const userId of userIds) {
      try {
        const res = await this.slackFetch(`/users.info?user=${userId}`)
        if (!res.ok) continue
        const data = await res.json() as { ok: boolean; user?: { real_name?: string; name?: string } }
        if (data.ok && data.user) {
          userMap.set(userId, data.user.real_name || data.user.name || userId)
        }
      } catch {
        // Best-effort — fall back to userId
      }
    }
    return userMap
  }

  private slackFetch(path: string, opts: RequestInit = {}): Promise<Response> {
    return fetchWithTimeout(`${this.baseUrl}${path}`, {
      ...opts,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json; charset=utf-8',
        ...opts.headers,
      },
    })
  }
}

export default SlackConnector
