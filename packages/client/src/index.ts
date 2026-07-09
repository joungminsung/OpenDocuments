export interface OpenDocumentsClientOptions {
  baseUrl: string
  apiKey?: string
}

export interface SearchResult {
  chunkId?: string
  content: string
  score: number
  documentId: string
  chunkType?: string
  headingHierarchy?: string[]
  sourcePath?: string
  sourceType?: string
}

export interface ConfidenceResult {
  score: number
  level: 'high' | 'medium' | 'low' | 'none'
  reason: string
}

export interface AskOptions {
  profile?: 'fast' | 'balanced' | 'precise' | string
  conversationId?: string
}

export interface QueryResult {
  queryId: string
  answer: string
  sources: SearchResult[]
  confidence: ConfidenceResult
  route: string
  profile: string
}

export interface DocumentListResponse {
  documents: Array<{ id: string; title: string; source_type: string; status: string; chunk_count: number }>
}

export interface UploadDocumentResponse {
  documentId: string
  chunks: number
  status: string
}

export interface Conversation {
  id: string
  title: string | null
  workspace_id?: string
  shared?: number | boolean
  share_token?: string | null
  created_at?: string
  updated_at?: string
}

export interface ConversationMessage {
  id: string
  conversation_id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  sources?: SearchResult[] | string | null
  metadata?: Record<string, unknown> | string | null
  created_at?: string
}

export interface ConversationListResponse {
  conversations: Conversation[]
  limit: number
  offset: number
}

export interface StatsResponse {
  documents: number; workspaces: number; plugins: number
}

export class OpenDocumentsClient {
  private baseUrl: string
  private headers: Record<string, string> = {}

  constructor(opts: OpenDocumentsClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    if (opts.apiKey) this.headers['X-API-Key'] = opts.apiKey
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...this.headers, ...init?.headers },
    })
    if (!res.ok) throw new Error(`OpenDocuments API error: ${res.status}`)
    return res.json()
  }

  async ask(query: string, optionsOrProfile?: AskOptions | string): Promise<QueryResult> {
    const options = typeof optionsOrProfile === 'string' ? { profile: optionsOrProfile } : (optionsOrProfile ?? {})
    return this.request('/chat', { method: 'POST', body: JSON.stringify({ query, ...options }) })
  }

  async listDocuments(): Promise<DocumentListResponse> {
    return this.request('/documents')
  }

  async uploadDocument(file: File): Promise<UploadDocumentResponse> {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${this.baseUrl}/api/v1/documents/upload`, {
      method: 'POST', body: formData, headers: this.headers,
    })
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  }

  async deleteDocument(id: string): Promise<void> {
    await this.request(`/documents/${id}`, { method: 'DELETE' })
  }

  async getHealth(): Promise<{ status: string; version: string }> {
    return this.request('/health')
  }

  async getStats(): Promise<StatsResponse> {
    return this.request('/stats')
  }

  async listConversations(opts?: { limit?: number; offset?: number }): Promise<ConversationListResponse> {
    const params = new URLSearchParams()
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.offset) params.set('offset', String(opts.offset))
    const query = params.toString()
    return this.request(`/conversations${query ? `?${query}` : ''}`)
  }

  async createConversation(title?: string): Promise<Conversation> {
    return this.request('/conversations', {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    })
  }

  async listConversationMessages(id: string): Promise<{ messages: ConversationMessage[] }> {
    return this.request(`/conversations/${encodeURIComponent(id)}/messages`)
  }

  async updateConversation(id: string, input: { title?: string }): Promise<{ updated: true }> {
    return this.request(`/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  }

  async deleteConversation(id: string): Promise<{ deleted: true }> {
    return this.request(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async shareConversation(id: string): Promise<{ shareUrl: string }> {
    return this.request(`/conversations/${encodeURIComponent(id)}/share`, { method: 'POST' })
  }
}
