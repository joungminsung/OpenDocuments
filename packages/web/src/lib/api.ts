import type { QueryResult, Document, StatsResponse, AdminStatsResponse, SearchQualityResponse, QueryLogsResponse, PluginHealthResponse, ConnectorStatusResponse } from './types'

const BASE = '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
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

export async function getPluginHealth(): Promise<PluginHealthResponse> {
  return request('/admin/plugins')
}

export async function getConnectorStatus(): Promise<ConnectorStatusResponse> {
  return request('/admin/connectors')
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
