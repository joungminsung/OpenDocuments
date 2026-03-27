import type { OpenDocumentsConfig } from './schema.js'

export const DEFAULT_CONFIG: OpenDocumentsConfig = {
  workspace: 'default',
  mode: 'personal',
  model: { provider: 'ollama', llm: 'qwen2.5:14b', embedding: 'bge-m3', embeddingProvider: undefined, apiKey: undefined, embeddingApiKey: undefined, baseUrl: undefined, embeddingDimensions: undefined },
  rag: { profile: 'balanced' },
  connectors: [],
  plugins: [],
  parserFallbacks: {},
  security: {
    dataPolicy: {
      allowCloudProcessing: true,
      autoRedact: { enabled: false, patterns: [], method: 'replace', replacement: '[REDACTED]' },
      sourceRestrictions: { localOnly: [], cloudAllowed: [] },
      workspaceOverrides: {},
    },
    transport: { enforceHTTPS: true, allowedEndpoints: [] },
    storage: { encryptAtRest: false, redactLogsContent: true },
    audit: { enabled: false, events: [], destination: 'local' },
  },
  ui: { locale: 'auto', theme: 'auto' },
  telemetry: { enabled: false },
  storage: { db: 'sqlite', vectorDb: 'lancedb', dataDir: '~/.opendocuments' },
}
