export interface OpenDocsClientOptions {
  baseUrl: string
  apiKey?: string
}

export interface QueryResult {
  queryId: string; answer: string; sources: any[]; confidence: any; route: string; profile: string
}

export class OpenDocsClient {
  private baseUrl: string
  private headers: Record<string, string> = {}

  constructor(opts: OpenDocsClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    if (opts.apiKey) this.headers['X-API-Key'] = opts.apiKey
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v1${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...this.headers, ...init?.headers },
    })
    if (!res.ok) throw new Error(`OpenDocs API error: ${res.status}`)
    return res.json()
  }

  async ask(query: string, profile?: string): Promise<QueryResult> {
    return this.request('/chat', { method: 'POST', body: JSON.stringify({ query, profile }) })
  }

  async listDocuments(): Promise<{ documents: any[] }> {
    return this.request('/documents')
  }

  async uploadDocument(file: File): Promise<any> {
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

  async getStats(): Promise<any> {
    return this.request('/stats')
  }
}
