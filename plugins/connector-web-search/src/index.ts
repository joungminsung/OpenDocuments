import type { PluginContext, HealthStatus } from '@opendocs/core'

export interface WebSearchConfig {
  provider?: 'tavily' | 'searxng'
  apiKey?: string
  baseUrl?: string
}

export interface WebSearchResult {
  title: string
  url: string
  content: string
  score: number
}

function fetchWithTimeout(url: string, opts: RequestInit, timeout = 15000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export class WebSearchProvider {
  name = '@opendocs/connector-web-search'
  version = '0.1.0'

  private provider: 'tavily' | 'searxng' = 'tavily'
  private apiKey = ''
  private baseUrl = ''

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as unknown as WebSearchConfig
    this.provider = config.provider || 'tavily'
    this.apiKey = config.apiKey || process.env.TAVILY_API_KEY || ''
    this.baseUrl = config.baseUrl || (this.provider === 'tavily' ? 'https://api.tavily.com' : '')
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.apiKey) return { healthy: false, message: `${this.provider.toUpperCase()} API key not set` }
    return { healthy: true, message: `${this.provider} configured` }
  }

  async search(query: string, maxResults = 5): Promise<WebSearchResult[]> {
    if (this.provider === 'tavily') {
      return this.searchTavily(query, maxResults)
    }
    // SearXNG support can be added later
    throw new Error(`Unsupported search provider: ${this.provider}`)
  }

  private async searchTavily(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const res = await fetchWithTimeout(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
      }),
    })

    if (!res.ok) throw new Error(`Tavily search error: ${res.status}`)

    const data = await res.json() as {
      results: { title: string; url: string; content: string; score: number }[]
    }

    return data.results.map(r => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
    }))
  }
}

export default WebSearchProvider
