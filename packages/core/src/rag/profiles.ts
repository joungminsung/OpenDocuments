export interface RAGProfileConfig {
  retrieval: { k: number; minScore: number; finalTopK: number }
  context: { maxTokens: number; historyMaxTokens: number }
  features: {
    reranker: boolean
    queryDecomposition: boolean
    crossLingual: boolean
    webSearch: boolean | 'fallback'
    hallucinationGuard: boolean | 'strict'
    adaptiveRetrieval: boolean
  }
}

const PROFILES: Record<string, RAGProfileConfig> = {
  fast: {
    retrieval: { k: 10, minScore: 0.5, finalTopK: 3 },
    context: { maxTokens: 8192, historyMaxTokens: 512 },
    features: {
      reranker: false,
      queryDecomposition: false,
      crossLingual: false,
      webSearch: false,
      hallucinationGuard: false,
      adaptiveRetrieval: false,
    },
  },
  balanced: {
    retrieval: { k: 20, minScore: 0.3, finalTopK: 5 },
    context: { maxTokens: 16384, historyMaxTokens: 1024 },
    features: {
      reranker: true,
      queryDecomposition: false,
      crossLingual: true,
      webSearch: 'fallback',
      hallucinationGuard: true,
      adaptiveRetrieval: true,
    },
  },
  precise: {
    retrieval: { k: 50, minScore: 0.15, finalTopK: 10 },
    context: { maxTokens: 32768, historyMaxTokens: 2048 },
    features: {
      reranker: true,
      queryDecomposition: true,
      crossLingual: true,
      webSearch: true,
      hallucinationGuard: 'strict',
      adaptiveRetrieval: true,
    },
  },
}

export function getProfileConfig(profile: string, customConfig?: Partial<RAGProfileConfig>): RAGProfileConfig {
  if (profile === 'custom') {
    const base = structuredClone(PROFILES.balanced)
    if (customConfig) {
      if (customConfig.retrieval) Object.assign(base.retrieval, customConfig.retrieval)
      if (customConfig.context) Object.assign(base.context, customConfig.context)
      if (customConfig.features) Object.assign(base.features, customConfig.features)
    }
    return base
  }

  const config = PROFILES[profile]
  if (!config) {
    throw new Error(`Unknown RAG profile: ${profile}. Available: ${Object.keys(PROFILES).join(', ')}, custom`)
  }
  return structuredClone(config)
}
