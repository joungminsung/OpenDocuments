import type { QueryResult, Document, StatsResponse, AdminStatsResponse, SearchQualityResponse, QueryLogsResponse, PluginHealthResponse, ConnectorStatusResponse, Conversation, ConversationMessage, WorkbenchResponse, Collection, Workspace } from './types'
import { withStoredApiKey } from './auth'

const BASE = '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers, ...rest } = options || {}
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    credentials: 'same-origin',
    headers: withStoredApiKey({ 'Content-Type': 'application/json', ...headers }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

// Chat
export async function chat(query: string, profile?: string): Promise<QueryResult> {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({ query, profile }),
  })
}

// Documents
export async function listDocuments(): Promise<{ documents: Document[] }> {
  return request('/documents')
}

export async function getDocument(id: string): Promise<Document> {
  return request(`/documents/${id}`)
}

export async function deleteDocument(id: string): Promise<void> {
  await request(`/documents/${id}`, { method: 'DELETE' })
}

export async function uploadDocument(file: File): Promise<{ documentId: string; chunks: number; status: string }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BASE}/documents/upload`, {
    credentials: 'same-origin',
    headers: withStoredApiKey(),
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(body.error || `Upload failed with HTTP ${res.status}`)
  }
  return res.json()
}

// Health
export async function getHealth(): Promise<{ status: string; version: string }> {
  return request('/health')
}

export async function getStats(): Promise<StatsResponse> {
  return request('/stats')
}

export async function getWorkbench(): Promise<WorkbenchResponse> {
  return request('/workbench')
}

export async function listWorkspaces(): Promise<{ workspaces: Workspace[] }> {
  return request('/workspaces')
}

// Conversations
export async function listConversations(opts?: { limit?: number; offset?: number }): Promise<{ conversations: Conversation[]; limit: number; offset: number }> {
  const params = new URLSearchParams()
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.offset) params.set('offset', String(opts.offset))
  const query = params.toString()
  return request(`/conversations${query ? `?${query}` : ''}`)
}

export async function createConversation(title?: string): Promise<Conversation> {
  return request('/conversations', {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
  })
}

export async function getConversationMessages(id: string): Promise<{ messages: ConversationMessage[] }> {
  return request(`/conversations/${encodeURIComponent(id)}/messages`)
}

export async function updateConversation(id: string, input: { title?: string }): Promise<{ updated: true }> {
  return request(`/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteConversation(id: string): Promise<{ deleted: true }> {
  return request(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function shareConversation(id: string): Promise<{ shareUrl: string }> {
  return request(`/conversations/${encodeURIComponent(id)}/share`, { method: 'POST' })
}

// Admin
export async function getAdminStats(): Promise<AdminStatsResponse> {
  return request('/admin/stats')
}

export async function getSearchQuality(): Promise<SearchQualityResponse> {
  return request('/admin/search-quality')
}

export async function getQueryLogs(opts?: { limit?: number; offset?: number; intent?: string }): Promise<QueryLogsResponse> {
  const params = new URLSearchParams()
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.offset) params.set('offset', String(opts.offset))
  if (opts?.intent) params.set('intent', opts.intent)
  return request(`/admin/query-logs?${params}`)
}

// Collections
export async function listCollections(): Promise<{ collections: Collection[] }> {
  return request('/collections')
}

export async function createCollection(input: { name: string; description?: string }): Promise<Collection> {
  return request('/collections', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function deleteCollection(id: string): Promise<{ deleted: true }> {
  return request(`/collections/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function getCollectionDocuments(id: string): Promise<{ collection: Collection; documents: Document[] }> {
  return request(`/collections/${encodeURIComponent(id)}/documents`)
}

export async function addDocumentToCollection(collectionId: string, documentId: string): Promise<{ added: true }> {
  return request(`/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(documentId)}`, { method: 'POST' })
}

export async function removeDocumentFromCollection(collectionId: string, documentId: string): Promise<{ removed: true }> {
  return request(`/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' })
}

export async function getPluginHealth(): Promise<PluginHealthResponse> {
  return request('/admin/plugins')
}

export async function getConnectorStatus(): Promise<ConnectorStatusResponse> {
  return request('/admin/connectors')
}

export async function connectGitHubConnector(input: {
  repo: string
  token?: string
  branch?: string
  paths?: string[]
  syncInterval?: number
}): Promise<{ connector: ConnectorStatusResponse['connectors'][number]; health: { healthy: boolean; message?: string } }> {
  return request('/admin/connectors/github', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function syncGitHubConnector(): Promise<{ result: {
  connectorName: string
  documentsDiscovered: number
  documentsIndexed: number
  documentsSkipped: number
  errors: string[]
} }> {
  return request('/admin/connectors/github/sync', { method: 'POST' })
}

export async function getModelBenchmarks(): Promise<{ benchmarks: Array<{
  name: string
  version: string
  capabilities: Record<string, boolean | undefined>
  health: { healthy: boolean; message?: string } | null
  generation: { latencyMs: number; tokensPerSec: number } | { error: string } | null
  embedding: { latencyMs: number; textsPerSec: number } | { error: string } | null
}> }> {
  return request('/admin/benchmark')
}

// Plugins
export async function searchPlugins(query: string): Promise<{ packages: Array<{ name: string; description: string; version: string; [key: string]: unknown }> }> {
  return request(`/plugins/search?q=${encodeURIComponent(query)}`)
}

export async function getPlugins(): Promise<{ plugins: Array<{ name: string; type: string; version: string; health: { healthy: boolean; message?: string } }> }> {
  return request('/plugins')
}

export async function installPlugin(name: string): Promise<{ status: string; message: string }> {
  return request('/plugins/install', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function removePlugin(name: string): Promise<{ status: string }> {
  return request(`/plugins/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

// Feedback
export async function submitFeedback(queryId: string, feedback: 'positive' | 'negative'): Promise<void> {
  await request('/chat/feedback', { method: 'POST', body: JSON.stringify({ queryId, feedback }) })
}

// Dashboard
export async function getDashboardData() {
  const [stats, adminStats, connectorStatus, pluginHealth] = await Promise.all([
    getStats(), getAdminStats(), getConnectorStatus(), getPluginHealth(),
  ])
  return { stats, adminStats, connectorStatus, pluginHealth }
}
