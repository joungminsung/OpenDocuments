import type { ConnectorPlugin, DiscoveredDocument, DocumentRef, RawDocument, PluginContext, HealthStatus } from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'

export interface JiraConfig {
  baseUrl?: string
  email?: string
  apiToken?: string
  project?: string
  statuses?: string[]
  syncInterval?: number
}

/** Atlassian Document Format node (simplified) */
interface AdfNode {
  type: string
  text?: string
  content?: AdfNode[]
}

interface JiraIssue {
  id: string
  key: string
  fields: {
    summary: string
    description?: AdfNode | null
    status: { name: string }
    assignee?: { displayName: string } | null
    updated: string
    comment?: {
      comments: Array<{
        id: string
        body: AdfNode
        author: { displayName: string }
        created: string
      }>
    }
  }
}

export class JiraConnector implements ConnectorPlugin {
  name = '@opendocuments/connector-jira'
  type = 'connector' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'

  private baseUrl = ''
  private authHeader = ''
  private project = ''
  private statuses: string[] = []

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as unknown as JiraConfig
    this.baseUrl = (config.baseUrl || process.env.JIRA_BASE_URL || '').replace(/\/$/, '')
    this.project = config.project || ''
    this.statuses = config.statuses || []

    const email = config.email || process.env.JIRA_EMAIL || ''
    const token = config.apiToken || process.env.JIRA_API_TOKEN || ''
    if (email && token) {
      this.authHeader = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64')
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.baseUrl || !this.authHeader) {
      return { healthy: false, message: 'Jira not configured (missing baseUrl or credentials)' }
    }
    try {
      const res = await this.jiraFetch('/rest/api/3/myself')
      return { healthy: res.ok, message: res.ok ? 'Connected to Jira' : `HTTP ${res.status}` }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *discover(): AsyncIterable<DiscoveredDocument> {
    const jql = this.buildJql()
    let startAt = 0
    const maxResults = 50
    let total = Infinity

    while (startAt < total) {
      const params = new URLSearchParams({
        jql,
        startAt: startAt.toString(),
        maxResults: maxResults.toString(),
        fields: 'summary,status,updated',
      })

      const res = await this.jiraFetch(`/rest/api/3/search?${params.toString()}`)
      if (!res.ok) throw new Error(`Jira search error: ${res.status}`)

      const data = await res.json() as {
        total: number
        issues: Array<{ id: string; key: string; fields: { summary: string; status: { name: string }; updated: string } }>
      }

      total = data.total

      for (const issue of data.issues) {
        yield {
          sourceId: issue.id,
          title: `[${issue.key}] ${issue.fields.summary}`,
          sourcePath: `jira://${issue.key}`,
          contentHash: issue.fields.updated,
        }
      }

      startAt += data.issues.length
      if (data.issues.length === 0) break
    }
  }

  async fetch(ref: DocumentRef): Promise<RawDocument> {
    // Extract issue key from sourcePath (jira://ISSUE-KEY) or fall back to sourceId
    const issueId = ref.sourcePath.startsWith('jira://')
      ? ref.sourcePath.slice('jira://'.length)
      : ref.sourceId

    const params = new URLSearchParams({
      fields: 'summary,description,status,assignee,comment',
    })

    const res = await this.jiraFetch(`/rest/api/3/issue/${issueId}?${params.toString()}`)
    if (!res.ok) throw new Error(`Jira issue fetch error: ${res.status}`)

    const data = await res.json() as JiraIssue
    const content = formatJiraIssueAsMarkdown(data)

    return {
      sourceId: ref.sourceId,
      title: `[${data.key}] ${data.fields.summary}`,
      content,
    }
  }

  /**
   * Build a JQL query string from configured project and statuses filters.
   */
  private buildJql(): string {
    const parts: string[] = []
    if (this.project) parts.push(`project = "${this.project}"`)
    if (this.statuses.length > 0) {
      const statusList = this.statuses.map(s => `"${s}"`).join(', ')
      parts.push(`status in (${statusList})`)
    }
    parts.push('ORDER BY updated DESC')
    return parts.join(' AND ')
  }

  private jiraFetch(path: string): Promise<Response> {
    return fetchWithTimeout(`${this.baseUrl}${path}`, {
      headers: {
        'Authorization': this.authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    }, 15000)
  }
}

/**
 * Convert an Atlassian Document Format (ADF) node tree to plain text.
 * Handles text and paragraph node types recursively.
 */
function adfToText(node: AdfNode | null | undefined): string {
  if (!node) return ''

  if (node.type === 'text') return node.text ?? ''

  if (node.content) {
    const childText = node.content.map(adfToText).join('')
    if (node.type === 'paragraph') return childText + '\n'
    return childText
  }

  return ''
}

function formatJiraIssueAsMarkdown(issue: JiraIssue): string {
  const { fields } = issue
  const lines: string[] = []

  lines.push(`# [${issue.key}] ${fields.summary}`)
  lines.push('')
  lines.push(`**Status:** ${fields.status.name}`)
  if (fields.assignee) lines.push(`**Assignee:** ${fields.assignee.displayName}`)
  lines.push('')

  if (fields.description) {
    const descText = adfToText(fields.description).trim()
    if (descText) {
      lines.push('## Description')
      lines.push('')
      lines.push(descText)
      lines.push('')
    }
  }

  const comments = fields.comment?.comments ?? []
  if (comments.length > 0) {
    lines.push('## Comments')
    lines.push('')
    for (const comment of comments) {
      const author = comment.author.displayName
      const date = comment.created.split('T')[0]
      const body = adfToText(comment.body).trim()
      lines.push(`**${author}** (${date}):`)
      lines.push(body)
      lines.push('')
    }
  }

  return lines.join('\n')
}

export default JiraConnector
