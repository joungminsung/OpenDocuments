import type { QueryResult, Document, StatsResponse } from './types'

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

export async function uploadDocument(file: File): Promise<any> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${BASE}/documents/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error('Upload failed')
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
export async function getAdminStats(): Promise<any> {
  return request('/admin/stats')
}

export async function getSearchQuality(): Promise<any> {
  return request('/admin/search-quality')
}

export async function getQueryLogs(opts?: { limit?: number; offset?: number; intent?: string }): Promise<any> {
  const params = new URLSearchParams()
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.offset) params.set('offset', String(opts.offset))
  if (opts?.intent) params.set('intent', opts.intent)
  return request(`/admin/query-logs?${params}`)
}

export async function getPluginHealth(): Promise<any> {
  return request('/admin/plugins')
}

export async function getConnectorStatus(): Promise<any> {
  return request('/admin/connectors')
}
