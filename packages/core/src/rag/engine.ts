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
import { checkGrounding, checkSemanticGrounding } from './grounding.js'
import { createQueryCache } from './cache.js'
import { DEFAULT_CONTEXT_WINDOW_CONFIG, fitToContextWindow } from './context-window.js'
import { generateHypotheticalAnswer } from './hyde.js'
import { expandMultiQuery } from './multi-query.js'
import { attachParentContext } from './parent-doc.js'
import { crossEncoderRerank } from './cross-encoder.js'
import { sha256 } from '../utils/hash.js'
import { getSystemPrompt, trimConversationHistory } from './generator.js'
import { estimateTokens } from '../utils/tokenizer.js'

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

  private buildCacheKey(query: string, profile: string, conversationHistory?: string): string {
    return sha256(`${query}\x00${profile}\x00${conversationHistory || ''}`)
  }

  async query(input: QueryInput): Promise<QueryResult> {
    const trimmedQuery = (input.query || '').trim()
    if (!trimmedQuery) {
      throw new Error('Query cannot be empty')
    }
    const queryId = randomUUID()
    const profileName = input.profile || this.defaultProfile
    const config = getProfileConfig(profileName, this.customProfileConfig)
    const trimmedHistory = trimConversationHistory(input.conversationHistory, config.context.historyMaxTokens)
    const route = routeQuery(trimmedQuery)

    this.eventBus.emit('query:received', { queryId, query: trimmedQuery })

    // L1 cache check (null byte delimiter prevents "queryA" + "B" == "query" + "AB" collisions)
    const cacheKey = this.buildCacheKey(trimmedQuery, profileName, trimmedHistory)

    if (route === 'direct') {
      return this.handleDirect(queryId, trimmedQuery, profileName)
    }

    const cached = this.queryCache.get(cacheKey) as QueryResult | undefined
    if (cached) {
      return { ...cached, queryId }
    }

    const result = await this.handleRAG(queryId, trimmedQuery, config, profileName, route, trimmedHistory)
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
    const trimmedHistory = trimConversationHistory(input.conversationHistory, config.context.historyMaxTokens)
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
    let sources = await this.retrieveWithFeatures(queryId, trimmedQuery, config, intent, trimmedHistory)

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
      conversationHistory: trimmedHistory,
      maxHistoryTokens: config.context.historyMaxTokens,
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
      const embedFn = this.embedder.embed
        ? (texts: string[]) => this.embedder.embed!(texts)
        : null
      const grounding = await checkSemanticGrounding(fullAnswer, sources, embedFn, strictMode)
      if (grounding.warnings.length > 0) {
        yield { type: 'grounding', data: grounding }
      }
    }

    // Cache the streamed result
    const cacheKey = this.buildCacheKey(trimmedQuery, profileName, trimmedHistory)
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
    let sources = await this.retrieveWithFeatures(queryId, query, config, intent, conversationHistory)

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
      maxHistoryTokens: config.context.historyMaxTokens,
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
      const embedFn = this.embedder.embed
        ? (texts: string[]) => this.embedder.embed!(texts)
        : null
      const grounding = await checkSemanticGrounding(answer, sources, embedFn, strictMode)
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
    conversationHistory?: string,
  ): Promise<SearchResult[]> {
    // Decompose query if enabled
    const decomposed = config.features.queryDecomposition
      ? decomposeQuery(query)
      : { original: query, subQueries: [query], isDecomposed: false }

    // HyDE: generate a hypothetical passage once per query; reused as an extra
    // embedding variant for every sub-query below. Costs 1 LLM call total when on.
    const hydePassage = config.features.hyde
      ? await generateHypotheticalAnswer(query, this.llm)
      : ''

    // Multi-query: paraphrases are computed lazily inside the per-sub-query loop
    // (1 LLM call per sub-query). On balanced this is 1 extra call per query;
    // on precise with decomposition it can be N. The accuracy lift justifies the cost.

    const subQueryResultSets: SearchResult[][] = []

    for (const subQuery of decomposed.subQueries) {
      // Start with cross-lingual variants of this sub-query
      let queryVariants = config.features.crossLingual
        ? expandQuery(subQuery)
        : [subQuery]

      // Multi-query paraphrase expansion on top of cross-lingual
      if (config.features.multiQuery && config.features.multiQueryN > 0) {
        const mqVariants = await expandMultiQuery(subQuery, this.llm, config.features.multiQueryN)
        // Merge dedup with existing variants (case-insensitive)
        const seen = new Set(queryVariants.map(v => v.toLowerCase()))
        for (const v of mqVariants) {
          const k = v.toLowerCase()
          if (!seen.has(k)) { seen.add(k); queryVariants.push(v) }
        }
      }

      // Optional HyDE variant: embed the hypothetical passage as another retrieval query.
      if (hydePassage) queryVariants = [...queryVariants, hydePassage]

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

    // Cross-encoder rerank (expensive: 1 LLM call per candidate). Runs after the
    // heuristic/rerank stage so it only scores already-filtered candidates.
    if (config.features.crossEncoder && results.length > 1) {
      results = await crossEncoderRerank(query, results, this.llm, Math.min(10, results.length))
    }

    // Parent-doc retrieval: replace precise chunks with their enclosing section text
    if (config.features.parentDocRetrieval) {
      results = attachParentContext(results)
    }

    // Trim to finalTopK after merging/reranking
    results = results.slice(0, config.retrieval.finalTopK)

    // Expand with sibling chunks for additional context
    results = await this.retriever.expandWithSiblings(results, this.store, 1)

    // Fit chunks into context window budget
    const contextWindowConfig = {
      ...DEFAULT_CONTEXT_WINDOW_CONFIG,
      maxContextTokens: config.context.maxTokens,
    }
    const systemPromptTokens = estimateTokens(getSystemPrompt({ intent: intent || 'general' }))
    const historyTokens = estimateTokens(conversationHistory || '')
    results = fitToContextWindow(results, contextWindowConfig, historyTokens, systemPromptTokens, intent)

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

    // Fallback: if minScore filtered everything, retry with a relaxed (but non-zero) threshold
    // to avoid returning completely irrelevant results.
    const FALLBACK_MIN_SCORE = 0.15
    if (results.length === 0 && config.retrieval.minScore > 0) {
      results = await this.retriever.retrieve(query, {
        k: config.retrieval.k,
        finalTopK: config.retrieval.finalTopK,
        minScore: FALLBACK_MIN_SCORE,
      })
    }

    // Adaptive retrieval: retry with relaxed parameters if results are insufficient
    if (config.features.adaptiveRetrieval && results.length < 3) {
      const relaxedResults = await this.retriever.retrieve(query, {
        k: retrieveOpts.k * 2,
        finalTopK: retrieveOpts.finalTopK,
        minScore: FALLBACK_MIN_SCORE,
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
