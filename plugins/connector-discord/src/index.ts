import type { ConnectorPlugin, DiscoveredDocument, DocumentRef, RawDocument, PluginContext, HealthStatus } from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'

export interface DiscordConfig {
  token?: string
  guildId?: string
  channels?: string[]
  maxMessages?: number
}

interface DiscordChannel {
  id: string
  name: string
  type: number
}

interface DiscordMessage {
  id: string
  content: string
  timestamp: string
  author: {
    username: string
  }
}

export class DiscordConnector implements ConnectorPlugin {
  name = '@opendocuments/connector-discord'
  type = 'connector' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'

  private token = ''
  private guildId = ''
  private channels: string[] = []
  private maxMessages = 500
  private baseUrl = 'https://discord.com/api/v10'

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as DiscordConfig
    this.token = config.token || process.env.DISCORD_BOT_TOKEN || ''
    this.guildId = config.guildId || process.env.DISCORD_GUILD_ID || ''
    this.channels = config.channels || []
    this.maxMessages = config.maxMessages ?? 500
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.token) return { healthy: false, message: 'DISCORD_BOT_TOKEN not set' }
    try {
      const res = await this.discordFetch('/users/@me')
      return {
        healthy: res.ok,
        message: res.ok ? 'Connected to Discord' : `HTTP ${res.status}`,
      }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    const res = await this.discordFetch(`/guilds/${this.guildId}/channels`)
    if (!res.ok) throw new Error(`Discord channels error: ${res.status}`)

    const allChannels = await res.json() as DiscordChannel[]

    // Filter to text channels (type === 0) only
    const textChannels = allChannels.filter(ch => ch.type === 0)
    const filteredChannels = this.channels.length > 0
      ? textChannels.filter(ch => this.channels.includes(ch.name) || this.channels.includes(ch.id))
      : textChannels

    for (const channel of filteredChannels) {
      const dayBatches = await this.fetchMessagesByDay(channel.id)

      for (const [day, messages] of Object.entries(dayBatches)) {
        const sourcePath = `discord://${channel.name}/${day}`
        yield {
          sourceId: `${channel.id}/${day}`,
          title: `#${channel.name} - ${day}`,
          sourcePath,
          contentHash: String(messages.length),
        }
      }
    }
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    // sourcePath format: discord://channel-name/YYYY-MM-DD
    // sourceId format: channelId/YYYY-MM-DD
    const [channelId, day] = ref.sourceId.split('/')
    const dayBatches = await this.fetchMessagesByDay(channelId)
    const messages = dayBatches[day] ?? []

    const content = messages
      .map(msg => `[${msg.author.username}]: ${msg.content}`)
      .join('\n')

    return {
      sourceId: ref.sourceId,
      title: ref.sourcePath,
      content,
    }
  }

  private async fetchMessagesByDay(channelId: string): Promise<Record<string, DiscordMessage[]>> {
    const collected: DiscordMessage[] = []
    let lastId: string | undefined

    while (collected.length < this.maxMessages) {
      const limit = Math.min(100, this.maxMessages - collected.length)
      const url = lastId
        ? `/channels/${channelId}/messages?limit=${limit}&before=${lastId}`
        : `/channels/${channelId}/messages?limit=${limit}`

      const res = await this.discordFetch(url)
      if (!res.ok) break

      const batch = await res.json() as DiscordMessage[]
      if (batch.length === 0) break

      collected.push(...batch)
      lastId = batch[batch.length - 1].id
    }

    // Group messages by day (YYYY-MM-DD extracted from ISO timestamp)
    const byDay: Record<string, DiscordMessage[]> = {}
    for (const msg of collected) {
      if (!msg.content.trim()) continue
      const day = msg.timestamp.slice(0, 10)
      if (!byDay[day]) byDay[day] = []
      byDay[day].push(msg)
    }

    // Reverse each day's messages so they are chronological (oldest first)
    for (const day of Object.keys(byDay)) {
      byDay[day].reverse()
    }

    return byDay
  }

  private discordFetch(path: string, opts: RequestInit = {}): Promise<Response> {
    return fetchWithTimeout(`${this.baseUrl}${path}`, {
      ...opts,
      headers: {
        'Authorization': `Bot ${this.token}`,
        'Content-Type': 'application/json',
        ...(opts.headers as Record<string, string> | undefined),
      },
    })
  }
}

export default DiscordConnector
