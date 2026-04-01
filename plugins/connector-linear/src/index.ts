import type { ConnectorPlugin, DiscoveredDocument, DocumentRef, RawDocument, PluginContext, HealthStatus } from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'

export interface LinearConfig {
  apiKey?: string
  teamId?: string
  statuses?: string[]
  syncInterval?: number
}

interface LinearIssue {
  id: string
  identifier: string
  title: string
  description?: string
  state: { name: string }
  assignee?: { name: string }
  updatedAt: string
  comments?: {
    nodes: Array<{ id: string; body: string; user?: { name: string }; createdAt: string }>
  }
}

interface LinearPageInfo {
  hasNextPage: boolean
  endCursor?: string
}

export class LinearConnector implements ConnectorPlugin {
  name = '@opendocuments/connector-linear'
  type = 'connector' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'

  private apiKey = ''
  private teamId = ''
  private statuses: string[] = []
  private readonly endpoint = 'https://api.linear.app/graphql'

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as unknown as LinearConfig
    this.apiKey = config.apiKey || process.env.LINEAR_API_KEY || ''
    this.teamId = config.teamId || ''
    this.statuses = config.statuses || []
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.apiKey) return { healthy: false, message: 'LINEAR_API_KEY not set' }
    try {
      const res = await this.gql('{ viewer { id name } }')
      if (!res.ok) return { healthy: false, message: `HTTP ${res.status}` }
      const data = await res.json() as { data?: { viewer?: { name: string } }; errors?: unknown[] }
      if (data.errors?.length) return { healthy: false, message: 'GraphQL error' }
      const name = data.data?.viewer?.name ?? 'unknown'
      return { healthy: true, message: `Connected as ${name}` }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    let cursor: string | undefined
    let hasNextPage = true

    while (hasNextPage) {
      const filter = this.buildFilter()
      const after = cursor ? `, after: "${cursor}"` : ''
      const query = `{
        issues(first: 50${after}, filter: ${filter}) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            identifier
            title
            updatedAt
            state { name }
          }
        }
      }`

      const res = await this.gql(query)
      if (!res.ok) throw new Error(`Linear API error: ${res.status}`)

      const body = await res.json() as {
        data?: {
          issues?: {
            pageInfo: LinearPageInfo
            nodes: Pick<LinearIssue, 'id' | 'identifier' | 'title' | 'updatedAt'>[]
          }
        }
        errors?: Array<{ message: string }>
      }

      if (body.errors?.length) {
        throw new Error(`Linear GraphQL error: ${body.errors[0].message}`)
      }

      const issues = body.data?.issues
      if (!issues) break

      for (const issue of issues.nodes) {
        yield {
          sourceId: issue.id,
          title: `[${issue.identifier}] ${issue.title}`,
          sourcePath: `linear://${issue.identifier}`,
          contentHash: issue.updatedAt,
        }
      }

      hasNextPage = issues.pageInfo.hasNextPage
      cursor = issues.pageInfo.endCursor
    }
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    // ref.sourcePath is like linear://IDENTIFIER, ref.sourceId is the UUID
    const query = `{
      issue(id: "${ref.sourceId}") {
        id
        identifier
        title
        description
        state { name }
        assignee { name }
        comments {
          nodes {
            id
            body
            user { name }
            createdAt
          }
        }
      }
    }`

    const res = await this.gql(query)
    if (!res.ok) throw new Error(`Linear fetch error: ${res.status}`)

    const body = await res.json() as {
      data?: { issue?: LinearIssue }
      errors?: Array<{ message: string }>
    }

    if (body.errors?.length) {
      throw new Error(`Linear GraphQL error: ${body.errors[0].message}`)
    }

    const issue = body.data?.issue
    if (!issue) throw new Error(`Issue not found: ${ref.sourcePath}`)

    const content = formatIssueAsMarkdown(issue)

    return {
      sourceId: ref.sourceId,
      title: `[${issue.identifier}] ${issue.title}`,
      content,
    }
  }

  /**
   * Build a Linear GraphQL filter object string based on configured teamId and statuses.
   */
  private buildFilter(): string {
    const parts: string[] = []
    if (this.teamId) parts.push(`team: { id: { eq: "${this.teamId}" } }`)
    if (this.statuses.length > 0) {
      const statusList = this.statuses.map(s => `"${s}"`).join(', ')
      parts.push(`state: { name: { in: [${statusList}] } }`)
    }
    return parts.length > 0 ? `{ ${parts.join(', ')} }` : '{}'
  }

  private gql(query: string): Promise<Response> {
    return fetchWithTimeout(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.apiKey,
      },
      body: JSON.stringify({ query }),
    }, 15000)
  }
}

function formatIssueAsMarkdown(issue: LinearIssue): string {
  const lines: string[] = []
  lines.push(`# [${issue.identifier}] ${issue.title}`)
  lines.push('')
  lines.push(`**Status:** ${issue.state.name}`)
  if (issue.assignee) lines.push(`**Assignee:** ${issue.assignee.name}`)
  lines.push('')

  if (issue.description) {
    lines.push('## Description')
    lines.push('')
    lines.push(issue.description)
    lines.push('')
  }

  const comments = issue.comments?.nodes ?? []
  if (comments.length > 0) {
    lines.push('## Comments')
    lines.push('')
    for (const comment of comments) {
      const author = comment.user?.name ?? 'Unknown'
      const date = comment.createdAt.split('T')[0]
      lines.push(`**${author}** (${date}):`)
      lines.push(comment.body)
      lines.push('')
    }
  }

  return lines.join('\n')
}

export default LinearConnector
