import type { ConnectorPlugin, DiscoveredDocument, DocumentRef, RawDocument, PluginContext, HealthStatus, ChangeEvent, Disposable } from '@opendocuments/core'
import { fetchWithTimeout } from '@opendocuments/core'

export interface GitHubConfig {
  repo: string         // owner/repo
  token?: string       // GitHub PAT (or GITHUB_TOKEN env)
  branch?: string      // default: main
  paths?: string[]     // paths to crawl (default: entire repo)
  syncInterval?: number // seconds
}

export class GitHubConnector implements ConnectorPlugin {
  name = '@opendocuments/connector-github'
  type = 'connector' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'

  private token = ''
  private repo = ''
  private branch = 'main'
  private baseUrl = 'https://api.github.com'

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as unknown as GitHubConfig
    this.repo = config.repo || ''
    this.token = config.token || process.env.GITHUB_TOKEN || ''
    this.branch = config.branch || 'main'
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.repo) return { healthy: false, message: 'No repo configured' }
    try {
      const res = await this.ghFetch(`/repos/${this.repo}`)
      return { healthy: res.ok, message: res.ok ? `Connected to ${this.repo}` : `HTTP ${res.status}` }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    // Get the file tree for the branch
    const treeRes = await this.ghFetch(`/repos/${this.repo}/git/trees/${this.branch}?recursive=1`)
    if (!treeRes.ok) throw new Error(`GitHub tree API error: ${treeRes.status}`)

    const data = await treeRes.json() as { tree: { path: string; type: string; sha: string }[] }
    const SUPPORTED_EXTENSIONS = new Set(['.md', '.mdx', '.txt', '.rst', '.js', '.ts', '.py', '.go', '.java', '.rs', '.html', '.json', '.yaml', '.yml'])

    for (const item of data.tree) {
      if (item.type !== 'blob') continue
      const ext = '.' + item.path.split('.').pop()?.toLowerCase()
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue

      yield {
        sourceId: item.sha,
        title: item.path.split('/').pop() || item.path,
        sourcePath: `github://${this.repo}/${item.path}`,
        contentHash: item.sha,
      }
    }
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    // Extract path from sourcePath (github://owner/repo/path)
    const path = ref.sourcePath.replace(`github://${this.repo}/`, '')

    const res = await this.ghFetch(`/repos/${this.repo}/contents/${path}?ref=${this.branch}`)
    if (!res.ok) throw new Error(`GitHub content API error: ${res.status}`)

    const data = await res.json() as { content: string; encoding: string; name: string }
    const content = Buffer.from(data.content, 'base64').toString('utf-8')

    return {
      sourceId: ref.sourceId,
      title: data.name,
      content,
    }
  }

  private ghFetch(path: string): Promise<Response> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'OpenDocuments/0.1.0',
    }
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`
    return fetchWithTimeout(`${this.baseUrl}${path}`, { headers })
  }
}

export default GitHubConnector
