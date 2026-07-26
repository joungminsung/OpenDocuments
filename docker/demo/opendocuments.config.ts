const provider = process.env.OPENDOCUMENTS_MODEL_PROVIDER || 'google'
const isOllama = provider === 'ollama'
const isGoogle = provider === 'google'
const defaultEmbeddingDimensions = isOllama ? 768 : isGoogle ? 3072 : 1536
const embeddingDimensions = Number(process.env.OPENDOCUMENTS_MODEL_EMBEDDING_DIMENSIONS || defaultEmbeddingDimensions)

export default {
  workspace: 'interview-demo',
  mode: 'personal',

  model: {
    provider,
    llm: process.env.OPENDOCUMENTS_MODEL_LLM || (isOllama ? 'gemma4:12b' : 'gemini-3.5-flash'),
    embedding: process.env.OPENDOCUMENTS_MODEL_EMBEDDING || (isOllama ? 'nomic-embed-text:latest' : 'gemini-embedding-001'),
    apiKey: process.env.OPENDOCUMENTS_MODEL_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENDOCUMENTS_MODEL_BASE_URL || (isOllama ? 'http://host.docker.internal:11434' : undefined),
    embeddingDimensions,
  },

  rag: {
    profile: (process.env.OPENDOCUMENTS_RAG_PROFILE as 'fast' | 'balanced' | 'precise' | undefined) || 'fast',
  },

  storage: {
    db: 'sqlite',
    vectorDb: 'lancedb',
    dataDir: '/data',
  },

  ui: {
    locale: 'ko',
    theme: 'auto',
  },

  telemetry: {
    enabled: false,
  },

  plugins: [
    'opendocuments-parser-code',
    'opendocuments-parser-pdf',
    'opendocuments-parser-docx',
    'opendocuments-parser-xlsx',
    'opendocuments-parser-html',
  ],
}
