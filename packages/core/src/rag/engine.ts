import { randomUUID } from 'node:crypto'
import type { DocumentStore, SearchResult } from '../ingest/document-store.js'
import type { ModelPlugin } from '../plugin/interfaces.js'
import type { EventBus } from '../events/bus.js'
import { Retriever } from './retriever.js'
import { getProfileConfig, type RAGProfileConfig } from './profiles.js'
import { calculateConfidence, type ConfidenceResult } from './confidence.js'
import { routeQuery, type QueryRoute } from './router.js'
import { generateAnswer, type GenerateInput } from './generator.js'
import { classifyIntent } from './intent.js'
import { decomposeQuery } from './decomposer.js'
import { expandQuery, reciprocalRankFusion } from './cross-lingual.js'
import { rerankResults } from './reranker.js'
import { checkGrounding } from './grounding.js'
import { createQueryCache } from './cache.js'
import { fitToContextWindow } from './context-window.js'
import { sha256 } from '../utils/hash.js'

export interface QueryInput {
  query: string
  profile?: string
  conversationId?: string
  conversationHistory?: string
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
  customProfileConfig?: Partial<RAGProfileConfig>
  rerankerModel?: ModelPlugin
  webSearchProvider?: any
}

export type StreamEvent =
  | { type: 'chunk'; data: string }
  | { type: 'sources'; data: SearchResult[] }
  | { type: 'confidence'; data: ConfidenceResult }
  | { type: 'grounding'; data: import('./grounding.js').GroundingResult }
  | { type: 'intent'; data: string }
  | { type: 'done'; data: { queryId: string; route: QueryRoute; profile: string } }

const INTENT_CHUNK_TYPES: Record<string, string[]> = {
  code: ['code-ast'],
  config: ['semantic', 'code-ast'],
  data: ['table'],
}

export function boostByMetadata(
  results: SearchResult[],
  query: string,
  intent: string,
): SearchResult[] {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1)

  return results.map(r => {
    let boost = 1.0

    // Heading match boost
    const headingText = (r.headingHierarchy || []).join(' ').toLowerCase()
    for (const qw of queryWords) {
      if (headingText.includes(qw)) {
        boost += 0.15
        break // Cap heading boost at 0.15
      }
    }

    // Intent-chunk type alignment boost
    const preferredTypes = INTENT_CHUNK_TYPES[intent]
    if (preferredTypes && preferredTypes.includes(r.chunkType)) {
      boost += 0.1
    }

    return { ...r, score: r.score * boost }
  })
}

export class RAGEngine {
  private store: DocumentStore
  private llm: ModelPlugin
  private embedder: ModelPlugin
  private eventBus: EventBus
  private defaultProfile: string
  private customProfileConfig: Partial<RAGProfileConfig> | undefined
  private retriever: Retriever
  private rerankerModel: ModelPlugin | undefined
  private webSearchProvider: any | undefined
  private queryCache = createQueryCache()

  constructor(opts: RAGEngineOptions) {
    this.store = opts.store
    this.llm = opts.llm
    this.embedder = opts.embedder
    this.eventBus = opts.eventBus
    this.defaultProfile = opts.defaultProfile
    this.customProfileConfig = opts.customProfileConfig
    this.rerankerModel = opts.rerankerModel
    this.webSearchProvider = opts.webSearchProvider
    this.retriever = new Retriever(this.store, this.embedder)
  }

  async query(input: QueryInput): Promise<QueryResult> {
    const trimmedQuery = (input.query || '').trim()
    if (!trimmedQuery) {
      throw new Error('Query cannot be empty')
    }
    const queryId = randomUUID()
    const profileName = input.profile || this.defaultProfile
    const config = getProfileConfig(profileName, this.customProfileConfig)
    const route = routeQuery(trimmedQuery)

    this.eventBus.emit('query:received', { queryId, query: trimmedQuery })

    // L1 cache check (null byte delimiter prevents "queryA" + "B" == "query" + "AB" collisions)
    const cacheKey = sha256(`${trimmedQuery}\x00${profileName}`)

    if (route === 'direct') {
      return this.handleDirect(queryId, trimmedQuery, profileName)
    }

    const cached = this.queryCache.get(cacheKey) as QueryResult | undefined
    if (cached) {
      return { ...cached, queryId }
    }

    const result = await this.handleRAG(queryId, trimmedQuery, config, profileName, route, input.conversationHistory)
    // Note: Full QueryResult including source content is cached.
    // Memory impact: ~500 entries * ~10KB average = ~5MB max. Acceptable for L1 cache.
    this.queryCache.set(cacheKey, result)
    return result
  }

  async *queryStream(input: QueryInput): AsyncIterable<StreamEvent> {
    const trimmedQuery = (input.query || '').trim()
    if (!trimmedQuery) {
      throw new Error('Query cannot be empty')
    }
    const queryId = randomUUID()
    const profileName = input.profile || this.defaultProfile
    const config = getProfileConfig(profileName, this.customProfileConfig)
    const route = routeQuery(trimmedQuery)

    this.eventBus.emit('query:received', { queryId, query: trimmedQuery })

    if (route === 'direct') {
      const result = await this.handleDirect(queryId, trimmedQuery, profileName)
      yield { type: 'chunk', data: result.answer }
      yield { type: 'sources', data: result.sources }
      yield { type: 'confidence', data: result.confidence }
      yield { type: 'done', data: { queryId: result.queryId, route: result.route, profile: result.profile } }
      return
    }

    // Classify intent
    const intent = classifyIntent(trimmedQuery)
    yield { type: 'intent', data: intent }

    // Retrieve with decomposition and cross-lingual support
    let sources = await this.retrieveWithFeatures(queryId, trimmedQuery, config, intent)

    // Apply metadata-based boosting
    sources = boostByMetadata(sources, trimmedQuery, intent)
    sources.sort((a, b) => b.score - a.score)

    yield { type: 'sources', data: sources }

    // Calculate confidence
    const confidence = this.computeConfidence(trimmedQuery, sources)
    yield { type: 'confidence', data: confidence }

    // Generate (streaming)
    const genInput: GenerateInput = {
      query: trimmedQuery,
      context: sources,
      intent,
      conversationHistory: input.conversationHistory,
    }

    let fullAnswer = ''
    for await (const chunk of generateAnswer(this.llm, genInput)) {
      fullAnswer += chunk
      yield { type: 'chunk', data: chunk }
    }

    this.eventBus.emit('query:generated', { queryId })

    // Apply grounding check after streaming completes (requires full answer)
    if (config.features.hallucinationGuard && fullAnswer) {
      const strictMode = config.features.hallucinationGuard === 'strict'
      const grounding = checkGrounding(fullAnswer, sources, strictMode)
      if (grounding.warnings.length > 0) {
        yield { type: 'grounding', data: grounding }
      }
    }

    // Cache the streamed result
    const cacheKey = sha256(`${trimmedQuery}\x00${profileName}`)
    this.queryCache.set(cacheKey, {
      queryId, answer: fullAnswer, sources, confidence, route, profile: profileName,
    })

    yield { type: 'done', data: { queryId, route, profile: profileName } }
  }

  private async handleDirect(queryId: string, query: string, profile: string): Promise<QueryResult> {
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
    conversationHistory?: string,
  ): Promise<QueryResult> {
    // Classify intent
    const intent = classifyIntent(query)

    // Retrieve with decomposition and cross-lingual support
    let sources = await this.retrieveWithFeatures(queryId, query, config, intent)

    // Apply metadata-based boosting
    sources = boostByMetadata(sources, query, intent)
    sources.sort((a, b) => b.score - a.score)

    // Calculate confidence
    const confidence = this.computeConfidence(query, sources)

    // Generate
    const genInput: GenerateInput = {
      query,
      context: sources,
      intent,
      conversationHistory,
    }

    let answer = ''
    try {
      for await (const chunk of generateAnswer(this.llm, genInput)) {
        answer += chunk
      }
    } catch (err) {
      console.error('[rag] Generation failed:', err instanceof Error ? err.message : String(err))
      answer = 'An error occurred while generating the answer. Please try again.'
    }

    this.eventBus.emit('query:generated', { queryId })

    // Hallucination guard
    if (config.features.hallucinationGuard) {
      const strictMode = config.features.hallucinationGuard === 'strict'
      const grounding = checkGrounding(answer, sources, strictMode)
      if (strictMode && grounding.warnings.length > 0) {
        answer = grounding.annotatedAnswer
      }
    }

    return {
      queryId,
      answer,
      sources,
      confidence,
      route,
      profile: profileName,
    }
  }

  /**
   * Retrieve with decomposition and cross-lingual expansion based on profile features.
   */
  private async retrieveWithFeatures(
    queryId: string,
    query: string,
    config: RAGProfileConfig,
    intent?: import('./intent.js').QueryIntent,
  ): Promise<SearchResult[]> {
    // Decompose query if enabled
    const decomposed = config.features.queryDecomposition
      ? decomposeQuery(query)
      : { original: query, subQueries: [query], isDecomposed: false }

    const subQueryResultSets: SearchResult[][] = []

    for (const subQuery of decomposed.subQueries) {
      // Cross-lingual expansion if enabled
      const queryVariants = config.features.crossLingual
        ? expandQuery(subQuery)
        : [subQuery]

      const variantResultSets: SearchResult[][] = []

      for (const variant of queryVariants) {
        const results = await this.retrieve(variant, config)
        variantResultSets.push(results)
      }

      // RRF merge cross-lingual variants (use chunkId for efficient dedup)
      const merged = variantResultSets.length > 1
        ? reciprocalRankFusion(variantResultSets, 60, (item) => item.chunkId)
        : variantResultSets[0]

      subQueryResultSets.push(merged)
    }

    // RRF merge sub-query results if decomposed (use chunkId for efficient dedup)
    let results = decomposed.isDecomposed && subQueryResultSets.length > 1
      ? reciprocalRankFusion(subQueryResultSets, 60, (item) => item.chunkId)
      : subQueryResultSets[0]

    // Rerank if enabled
    if (config.features.reranker && results.length > 1) {
      results = await rerankResults(query, results, this.rerankerModel, intent)
    }

    // Trim to finalTopK after merging/reranking
    results = results.slice(0, config.retrieval.finalTopK)

    // Expand with sibling chunks for additional context
    results = this.retriever.expandWithSiblings(results, this.store, 1)

    // Fit chunks into context window budget
    results = fitToContextWindow(results, undefined, 0, 0, intent)

    // Web search integration
    if (this.webSearchProvider && config.features.webSearch) {
      const shouldSearch = config.features.webSearch === true ||
        (config.features.webSearch === 'fallback' && results.length < 3)

      if (shouldSearch) {
        try {
          const webResults = await this.webSearchProvider.search(query, 5)
          const webSearchResults: SearchResult[] = webResults
            .filter((r: any) => r && typeof r.content === 'string' && typeof r.score === 'number')
            .map((r: any, i: number) => ({
              chunkId: `web_${i}`,
              content: r.content,
              score: r.score,
              documentId: 'web-search',
              chunkType: 'semantic' as const,
              headingHierarchy: [r.title || 'Web Result'],
              sourcePath: r.url || '',
              sourceType: 'web',
            }))
          results = reciprocalRankFusion([results, webSearchResults], 60, (item) => item.chunkId)
            .slice(0, config.retrieval.finalTopK)
        } catch (err) {
          console.error('[web-search] Failed:', err instanceof Error ? err.message : String(err))
        }
      }
    }

    this.eventBus.emit('query:retrieved', { queryId, chunks: results.length })

    return results
  }

  private async retrieve(
    query: string,
    config: RAGProfileConfig,
  ): Promise<SearchResult[]> {
    const retrieveOpts = {
      k: config.retrieval.k,
      finalTopK: config.retrieval.finalTopK,
      minScore: config.retrieval.minScore,
    }

    let results = await this.retriever.retrieve(query, retrieveOpts)

    // Fallback: if minScore filtered everything, retry without threshold.
    if (results.length === 0 && config.retrieval.minScore > 0) {
      results = await this.retriever.retrieve(query, {
        k: config.retrieval.k,
        finalTopK: config.retrieval.finalTopK,
      })
    }

    // Adaptive retrieval: retry with relaxed parameters if results are insufficient
    if (config.features.adaptiveRetrieval && results.length < 3) {
      const relaxedResults = await this.retriever.retrieve(query, {
        k: retrieveOpts.k * 2,
        finalTopK: retrieveOpts.finalTopK,
        minScore: 0,
      })
      if (relaxedResults.length > results.length) {
        results = relaxedResults
      }
    }

    return results
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

  private getDirectResponse(_query: string): string {
    // Routing is already decided by routeQuery() in router.ts.
    // This method only needs to supply a friendly reply — no need to re-check patterns.
    return 'I am OpenDocuments, your documentation assistant. How can I help you today?'
  }
}
