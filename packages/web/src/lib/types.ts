export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SearchResult[]
  confidence?: ConfidenceResult
  profile?: string
  queryId?: string
  timestamp: number
}

export interface Conversation {
  id: string
  title: string | null
  workspaceId?: string
  workspace_id?: string
  shared?: boolean | number
  share_token?: string | null
  createdAt?: string
  updatedAt?: string
  created_at?: string
  updated_at?: string
}

export interface ConversationMessage {
  id: string
  conversationId?: string
  conversation_id?: string
  role: 'user' | 'assistant'
  content: string
  sources?: SearchResult[] | string | null
  profileUsed?: string
  profile_used?: string
  confidenceScore?: number | null
  confidence_score?: number | null
  createdAt?: string
  created_at?: string
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
  | { type: 'done'; data: { queryId: string; route: string; profile: string; conversationId?: string } }

export interface Document {
  id: string
  title: string
  source_type: string
  source_path: string
  file_type: string | null
  file_size_bytes?: number | null
  connector_id?: string | null
  chunk_count: number
  status: string
  content_hash?: string | null
  error_message?: string | null
  created_at: string
  updated_at?: string
  indexed_at: string | null
}

export interface Collection {
  id: string
  workspaceId: string
  name: string
  description: string | null
  autoRules: Record<string, unknown> | null
  createdAt: string
}

export interface Workspace {
  id: string
  name: string
  mode: 'personal' | 'team'
  settings: Record<string, unknown>
  createdAt: string
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
    id?: string
    query: string; intent: string | null; profile: string; route: string | null
    confidence_score: number | null; response_time_ms: number | null; feedback: string | null; created_at: string
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
    name: string; connectorId: string; type: string; status: string; lastSyncedAt: string | null; syncIntervalSeconds?: number | null; repo?: string
  }>
}

export interface WorkbenchResponse {
  health: {
    status: string
    version: string
    modelStatus: 'ready' | 'degraded'
    models: number
  }
  corpus: {
    documents: number
    chunks: number
    sourceDistribution: Record<string, number>
    statusDistribution: Record<string, number>
  }
  quality: {
    totalQueries: number
    avgConfidence: number
    avgResponseTimeMs: number
    feedback: { positive: number; negative: number }
  }
  connectors: {
    total: number
    active: number
    recent: Array<{
      name: string
      type: string
      status: string
      lastSyncedAt: string | null
      repo?: string
    }>
  }
  recentQueries: Array<{
    query: string
    profile: string
    confidenceScore: number | null
    responseTimeMs: number | null
    route: string | null
    createdAt: string
  }>
  suggestedQuestions: string[]
  workspace: {
    name: string
    mode: string
  }
}
