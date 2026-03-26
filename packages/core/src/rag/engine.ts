import { randomUUID } from 'node:crypto'
import type { DocumentStore, SearchResult } from '../ingest/document-store.js'
import type { ModelPlugin } from '../plugin/interfaces.js'
import type { EventBus } from '../events/bus.js'
import { Retriever } from './retriever.js'
import { getProfileConfig, type RAGProfileConfig } from './profiles.js'
import { calculateConfidence, type ConfidenceResult } from './confidence.js'
import { routeQuery, type QueryRoute } from './router.js'
import { generateAnswer, type GenerateInput } from './generator.js'

export interface QueryInput {
  query: string
  profile?: string
  conversationId?: string
}

export interface QueryResult {
  queryId: string
  answer: string
  sources: SearchResult[]
  confidence: ConfidenceResult
  route: QueryRoute
  profile: string
}

export interface RAGEngineOptions {
  store: DocumentStore
  llm: ModelPlugin
  embedder: ModelPlugin
  eventBus: EventBus
  defaultProfile: string
}

export type StreamEvent =
  | { type: 'chunk'; data: string }
  | { type: 'sources'; data: SearchResult[] }
  | { type: 'confidence'; data: ConfidenceResult }
  | { type: 'done'; data: { queryId: string; route: string; profile: string } }

export class RAGEngine {
  private store: DocumentStore
  private llm: ModelPlugin
  private embedder: ModelPlugin
  private eventBus: EventBus
  private defaultProfile: string
  private retriever: Retriever

  constructor(opts: RAGEngineOptions) {
    this.store = opts.store
    this.llm = opts.llm
    this.embedder = opts.embedder
    this.eventBus = opts.eventBus
    this.defaultProfile = opts.defaultProfile
    this.retriever = new Retriever(this.store, this.embedder)
  }

  async query(input: QueryInput): Promise<QueryResult> {
    const queryId = randomUUID()
    const profileName = input.profile || this.defaultProfile
    const config = getProfileConfig(profileName)
    const route = routeQuery(input.query)

    this.eventBus.emit('query:received', { queryId, query: input.query })

    if (route === 'direct') {
      return this.handleDirect(queryId, input.query, profileName)
    }

    return this.handleRAG(queryId, input.query, config, profileName, route)
  }

  async *queryStream(input: QueryInput): AsyncIterable<StreamEvent> {
    const queryId = randomUUID()
    const profileName = input.profile || this.defaultProfile
    const config = getProfileConfig(profileName)
    const route = routeQuery(input.query)

    this.eventBus.emit('query:received', { queryId, query: input.query })

    if (route === 'direct') {
      const result = this.handleDirect(queryId, input.query, profileName)
      yield { type: 'chunk', data: result.answer }
      yield { type: 'sources', data: result.sources }
      yield { type: 'confidence', data: result.confidence }
      yield { type: 'done', data: { queryId: result.queryId, route: result.route, profile: result.profile } }
      return
    }

    // Retrieve
    const sources = await this.retrieve(queryId, input.query, config)

    yield { type: 'sources', data: sources }

    // Calculate confidence
    const confidence = this.computeConfidence(input.query, sources)
    yield { type: 'confidence', data: confidence }

    // Generate (streaming)
    const genInput: GenerateInput = {
      query: input.query,
      context: sources,
      // TODO(Phase 2): Implement intent classification (code | concept | config | data | search | compare)
      // Currently defaults to 'general'. Intent-specific prompt templates exist in generator.ts.
      intent: 'general',
    }

    let fullAnswer = ''
    for await (const chunk of generateAnswer(this.llm, genInput)) {
      fullAnswer += chunk
      yield { type: 'chunk', data: chunk }
    }

    this.eventBus.emit('query:generated', { queryId })

    yield { type: 'done', data: { queryId, route, profile: profileName } }
  }

  private handleDirect(queryId: string, query: string, profile: string): QueryResult {
    const answer = this.getDirectResponse(query)

    this.eventBus.emit('query:generated', { queryId })

    return {
      queryId,
      answer,
      sources: [],
      confidence: { score: 1, level: 'high', reason: 'Direct response' },
      route: 'direct',
      profile,
    }
  }

  private async handleRAG(
    queryId: string,
    query: string,
    config: RAGProfileConfig,
    profileName: string,
    route: QueryRoute,
  ): Promise<QueryResult> {
    // Retrieve
    const sources = await this.retrieve(queryId, query, config)

    // Calculate confidence
    const confidence = this.computeConfidence(query, sources)

    // Generate
    const genInput: GenerateInput = {
      query,
      context: sources,
      // TODO(Phase 2): Implement intent classification (code | concept | config | data | search | compare)
      // Currently defaults to 'general'. Intent-specific prompt templates exist in generator.ts.
      intent: 'general',
    }

    let answer = ''
    for await (const chunk of generateAnswer(this.llm, genInput)) {
      answer += chunk
    }

    this.eventBus.emit('query:generated', { queryId })

    return {
      queryId,
      answer,
      sources,
      confidence,
      route,
      profile: profileName,
    }
  }

  private async retrieve(
    queryId: string,
    query: string,
    config: RAGProfileConfig,
  ): Promise<SearchResult[]> {
    let sources = await this.retriever.retrieve(query, {
      k: config.retrieval.k,
      finalTopK: config.retrieval.finalTopK,
      minScore: config.retrieval.minScore,
    })

    // Fallback: if minScore filtered everything, retry without threshold.
    // This trades result quality for availability — the confidence score will be lower
    // because retrieval scores on fallback results are below the configured threshold.
    if (sources.length === 0 && config.retrieval.minScore > 0) {
      sources = await this.retriever.retrieve(query, {
        k: config.retrieval.k,
        finalTopK: config.retrieval.finalTopK,
      })
    }

    this.eventBus.emit('query:retrieved', { queryId, chunks: sources.length })

    return sources
  }

  private computeConfidence(query: string, sources: SearchResult[]): ConfidenceResult {
    const queryKeywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)

    return calculateConfidence({
      retrievalScores: sources.map(s => s.score),
      rerankScores: [],
      sourceCount: new Set(sources.map(r => r.documentId)).size,
      queryKeywords,
      chunkTexts: sources.map(s => s.content),
    })
  }

  private getDirectResponse(query: string): string {
    const lower = query.toLowerCase().trim()

    if (/^(hi|hello|hey|howdy|yo|sup|greetings)\b/i.test(lower) ||
        /^(안녕|안녕하세요|반갑습니다|하이|헬로)/.test(lower) ||
        /^(good\s+(morning|afternoon|evening|day))\b/i.test(lower)) {
      return 'Hello! I am OpenDocs, your documentation assistant. How can I help you today?'
    }

    if (/^(thanks|thank\s+you|감사합니다|고마워)\b/i.test(lower)) {
      return 'You are welcome! If you have more questions, feel free to ask. I am OpenDocs, here to help.'
    }

    return 'I am OpenDocs, your documentation assistant. You can ask me questions about your documents.'
  }
}
