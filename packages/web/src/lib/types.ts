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
