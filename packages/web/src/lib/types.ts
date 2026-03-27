export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SearchResult[]
  confidence?: ConfidenceResult
  profile?: string
  timestamp: number
}

export interface SearchResult {
  chunkId: string
  content: string
  score: number
  documentId: string
  chunkType: string
  headingHierarchy: string[]
  sourcePath: string
  sourceType: string
}

export interface ConfidenceResult {
  score: number
  level: 'high' | 'medium' | 'low' | 'none'
  reason: string
}

export interface QueryResult {
  queryId: string
  answer: string
  sources: SearchResult[]
  confidence: ConfidenceResult
  route: string
  profile: string
}

export type StreamEvent =
  | { type: 'chunk'; data: string }
  | { type: 'sources'; data: SearchResult[] }
  | { type: 'confidence'; data: ConfidenceResult }
  | { type: 'done'; data: { queryId: string; route: string; profile: string } }

export interface Document {
  id: string
  title: string
  source_type: string
  source_path: string
  file_type: string | null
  chunk_count: number
  status: string
  created_at: string
  indexed_at: string | null
}

export interface StatsResponse {
  documents: number
  workspaces: number
  plugins: number
  pluginList: { name: string; type: string; version: string }[]
}

export type RAGProfile = 'fast' | 'balanced' | 'precise'

export interface AdminStatsResponse {
  documents: number
  chunks: number
  workspaces: number
  plugins: number
  sourceDistribution: Record<string, number>
  statusDistribution: Record<string, number>
  fileTypeDistribution: Record<string, number>
}

export interface SearchQualityResponse {
  totalQueries: number
  avgConfidence: number
  avgResponseTimeMs: number
  intentDistribution: Record<string, number>
  routeDistribution: Record<string, number>
  feedback: { positive: number; negative: number }
}

export interface QueryLogsResponse {
  logs: Array<{
    query: string; intent: string; profile: string; route: string
    confidence_score: number; response_time_ms: number; feedback: string | null; created_at: string
  }>
  total: number; limit: number; offset: number
}

export interface PluginHealthResponse {
  plugins: Array<{
    name: string; type: string; version: string
    health: { healthy: boolean; message?: string }
    metrics: Record<string, unknown>
  }>
}

export interface ConnectorStatusResponse {
  connectors: Array<{
    name: string; connectorId: string; status: string; lastSyncedAt: string | null
  }>
}
