import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildConfigFromEnv } from '../../src/config/env-loader.js'

// Keys managed by each test — collected so afterEach can clean them up reliably.
type EnvSnapshot = Record<string, string | undefined>

function setEnv(vars: Record<string, string>): EnvSnapshot {
  const snapshot: EnvSnapshot = {}
  for (const [key, value] of Object.entries(vars)) {
    snapshot[key] = process.env[key]
    process.env[key] = value
  }
  return snapshot
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const [key, original] of Object.entries(snapshot)) {
    if (original === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = original
    }
  }
}

// Save and clear all OPENDOCUMENTS_* vars + well-known API key vars before each test.
const MANAGED_VARS = [
  'OPENDOCUMENTS_WORKSPACE',
  'OPENDOCUMENTS_MODE',
  'OPENDOCUMENTS_MODEL_PROVIDER',
  'OPENDOCUMENTS_MODEL_LLM',
  'OPENDOCUMENTS_MODEL_EMBEDDING',
  'OPENDOCUMENTS_MODEL_EMBEDDING_PROVIDER',
  'OPENDOCUMENTS_MODEL_API_KEY',
  'OPENDOCUMENTS_MODEL_BASE_URL',
  'OPENDOCUMENTS_MODEL_EMBEDDING_DIMENSIONS',
  'OPENDOCUMENTS_RAG_PROFILE',
  'OPENDOCUMENTS_STORAGE_DB',
  'OPENDOCUMENTS_STORAGE_VECTOR_DB',
  'OPENDOCUMENTS_STORAGE_VECTOR_DB_URL',
  'OPENDOCUMENTS_STORAGE_DATA_DIR',
  'OPENDOCUMENTS_UI_LOCALE',
  'OPENDOCUMENTS_UI_THEME',
  'OPENDOCUMENTS_TELEMETRY_ENABLED',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GROK_API_KEY',
]

let baseSnapshot: EnvSnapshot

beforeEach(() => {
  baseSnapshot = {}
  for (const key of MANAGED_VARS) {
    baseSnapshot[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  restoreEnv(baseSnapshot)
})

describe('buildConfigFromEnv', () => {
  describe('returns null when no relevant env vars are set', () => {
    it('returns null with empty env', () => {
      expect(buildConfigFromEnv()).toBeNull()
    })

    it('returns null when only DATA_DIR is set (excluded var)', () => {
      const snap = setEnv({ OPENDOCUMENTS_DATA_DIR: '/tmp/data' })
      // DATA_DIR is excluded from detection — result should still be null
      // because it is NOT in the detected-vars list.
      expect(buildConfigFromEnv()).toBeNull()
      restoreEnv(snap)
    })
  })

  describe('maps workspace and mode from env', () => {
    it('maps OPENDOCUMENTS_WORKSPACE', () => {
      setEnv({ OPENDOCUMENTS_WORKSPACE: 'my-workspace' })
      const result = buildConfigFromEnv()
      expect(result).not.toBeNull()
      expect(result?.workspace).toBe('my-workspace')
    })

    it('maps OPENDOCUMENTS_MODE = team', () => {
      setEnv({ OPENDOCUMENTS_MODE: 'team' })
      const result = buildConfigFromEnv()
      expect(result?.mode).toBe('team')
    })

    it('maps OPENDOCUMENTS_MODE = personal', () => {
      setEnv({ OPENDOCUMENTS_MODE: 'personal' })
      const result = buildConfigFromEnv()
      expect(result?.mode).toBe('personal')
    })

    it('ignores invalid OPENDOCUMENTS_MODE value', () => {
      setEnv({ OPENDOCUMENTS_WORKSPACE: 'ws', OPENDOCUMENTS_MODE: 'invalid' })
      const result = buildConfigFromEnv()
      expect(result?.mode).toBeUndefined()
    })
  })

  describe('maps model provider from env', () => {
    it('maps OPENDOCUMENTS_MODEL_PROVIDER', () => {
      setEnv({ OPENDOCUMENTS_MODEL_PROVIDER: 'openai' })
      const result = buildConfigFromEnv()
      expect(result?.model?.provider).toBe('openai')
    })

    it('maps OPENDOCUMENTS_MODEL_LLM', () => {
      setEnv({ OPENDOCUMENTS_MODEL_LLM: 'gpt-4o' })
      const result = buildConfigFromEnv()
      expect(result?.model?.llm).toBe('gpt-4o')
    })

    it('maps OPENDOCUMENTS_MODEL_EMBEDDING', () => {
      setEnv({ OPENDOCUMENTS_MODEL_EMBEDDING: 'text-embedding-3-small' })
      const result = buildConfigFromEnv()
      expect(result?.model?.embedding).toBe('text-embedding-3-small')
    })

    it('maps OPENDOCUMENTS_MODEL_EMBEDDING_PROVIDER', () => {
      setEnv({
        OPENDOCUMENTS_MODEL_PROVIDER: 'anthropic',
        OPENDOCUMENTS_MODEL_EMBEDDING_PROVIDER: 'openai',
      })
      const result = buildConfigFromEnv()
      expect(result?.model?.provider).toBe('anthropic')
      expect(result?.model?.embeddingProvider).toBe('openai')
    })

    it('maps OPENDOCUMENTS_MODEL_BASE_URL', () => {
      setEnv({ OPENDOCUMENTS_MODEL_BASE_URL: 'http://localhost:11434' })
      const result = buildConfigFromEnv()
      expect(result?.model?.baseUrl).toBe('http://localhost:11434')
    })

    it('maps OPENDOCUMENTS_MODEL_EMBEDDING_DIMENSIONS as integer', () => {
      setEnv({ OPENDOCUMENTS_MODEL_EMBEDDING_DIMENSIONS: '1536' })
      const result = buildConfigFromEnv()
      expect(result?.model?.embeddingDimensions).toBe(1536)
    })

    it('ignores non-numeric OPENDOCUMENTS_MODEL_EMBEDDING_DIMENSIONS', () => {
      setEnv({ OPENDOCUMENTS_MODEL_EMBEDDING_DIMENSIONS: 'abc' })
      const result = buildConfigFromEnv()
      expect(result?.model?.embeddingDimensions).toBeUndefined()
    })

    it('maps OPENDOCUMENTS_MODEL_API_KEY directly', () => {
      setEnv({ OPENDOCUMENTS_MODEL_API_KEY: 'sk-test-123' })
      const result = buildConfigFromEnv()
      expect(result?.model?.apiKey).toBe('sk-test-123')
    })
  })

  describe('maps API keys from standard provider env vars', () => {
    it('maps OPENAI_API_KEY when provider is openai', () => {
      setEnv({
        OPENDOCUMENTS_MODEL_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-openai-abc',
      })
      const result = buildConfigFromEnv()
      expect(result?.model?.apiKey).toBe('sk-openai-abc')
    })

    it('maps ANTHROPIC_API_KEY when provider is anthropic', () => {
      setEnv({
        OPENDOCUMENTS_MODEL_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-abc',
      })
      const result = buildConfigFromEnv()
      expect(result?.model?.apiKey).toBe('sk-ant-abc')
    })

    it('maps GOOGLE_API_KEY when provider is google', () => {
      setEnv({
        OPENDOCUMENTS_MODEL_PROVIDER: 'google',
        GOOGLE_API_KEY: 'AIza-abc',
      })
      const result = buildConfigFromEnv()
      expect(result?.model?.apiKey).toBe('AIza-abc')
    })

    it('maps GROK_API_KEY when provider is grok', () => {
      setEnv({
        OPENDOCUMENTS_MODEL_PROVIDER: 'grok',
        GROK_API_KEY: 'xai-abc',
      })
      const result = buildConfigFromEnv()
      expect(result?.model?.apiKey).toBe('xai-abc')
    })

    it('OPENDOCUMENTS_MODEL_API_KEY takes precedence over well-known provider key', () => {
      setEnv({
        OPENDOCUMENTS_MODEL_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-openai-abc',
        OPENDOCUMENTS_MODEL_API_KEY: 'sk-override',
      })
      const result = buildConfigFromEnv()
      expect(result?.model?.apiKey).toBe('sk-override')
    })

    it('does not pick up OPENAI_API_KEY when provider is not openai', () => {
      setEnv({
        OPENDOCUMENTS_MODEL_PROVIDER: 'anthropic',
        OPENAI_API_KEY: 'sk-openai-abc',
      })
      const result = buildConfigFromEnv()
      // Only ANTHROPIC_API_KEY should be picked up, OPENAI_API_KEY must not leak.
      expect(result?.model?.apiKey).toBeUndefined()
    })
  })

  describe('maps RAG profile from env', () => {
    it('maps OPENDOCUMENTS_RAG_PROFILE = precise', () => {
      setEnv({ OPENDOCUMENTS_RAG_PROFILE: 'precise' })
      const result = buildConfigFromEnv()
      expect(result?.rag?.profile).toBe('precise')
    })

    it('maps OPENDOCUMENTS_RAG_PROFILE = fast', () => {
      setEnv({ OPENDOCUMENTS_RAG_PROFILE: 'fast' })
      const result = buildConfigFromEnv()
      expect(result?.rag?.profile).toBe('fast')
    })

    it('maps OPENDOCUMENTS_RAG_PROFILE = custom', () => {
      setEnv({ OPENDOCUMENTS_RAG_PROFILE: 'custom' })
      const result = buildConfigFromEnv()
      expect(result?.rag?.profile).toBe('custom')
    })

    it('ignores invalid RAG profile value', () => {
      setEnv({ OPENDOCUMENTS_RAG_PROFILE: 'turbo' })
      const result = buildConfigFromEnv()
      expect(result?.rag).toBeUndefined()
    })
  })

  describe('maps storage settings from env', () => {
    it('maps OPENDOCUMENTS_STORAGE_DB = postgres', () => {
      setEnv({ OPENDOCUMENTS_STORAGE_DB: 'postgres' })
      const result = buildConfigFromEnv()
      expect(result?.storage?.db).toBe('postgres')
    })

    it('maps OPENDOCUMENTS_STORAGE_VECTOR_DB = qdrant', () => {
      setEnv({ OPENDOCUMENTS_STORAGE_VECTOR_DB: 'qdrant' })
      const result = buildConfigFromEnv()
      expect(result?.storage?.vectorDb).toBe('qdrant')
    })

    it('maps OPENDOCUMENTS_STORAGE_VECTOR_DB_URL', () => {
      setEnv({ OPENDOCUMENTS_STORAGE_VECTOR_DB_URL: 'http://qdrant:6333' })
      const result = buildConfigFromEnv()
      expect(result?.storage?.vectorDbUrl).toBe('http://qdrant:6333')
    })

    it('maps OPENDOCUMENTS_STORAGE_DATA_DIR', () => {
      setEnv({ OPENDOCUMENTS_STORAGE_DATA_DIR: '/var/opendocuments' })
      const result = buildConfigFromEnv()
      expect(result?.storage?.dataDir).toBe('/var/opendocuments')
    })

    it('ignores invalid OPENDOCUMENTS_STORAGE_DB value', () => {
      setEnv({ OPENDOCUMENTS_STORAGE_VECTOR_DB: 'lancedb', OPENDOCUMENTS_STORAGE_DB: 'mysql' })
      const result = buildConfigFromEnv()
      expect(result?.storage?.db).toBeUndefined()
      expect(result?.storage?.vectorDb).toBe('lancedb')
    })
  })

  describe('maps UI and telemetry settings from env', () => {
    it('maps OPENDOCUMENTS_UI_LOCALE', () => {
      setEnv({ OPENDOCUMENTS_UI_LOCALE: 'ko' })
      const result = buildConfigFromEnv()
      expect(result?.ui?.locale).toBe('ko')
    })

    it('maps OPENDOCUMENTS_UI_THEME = dark', () => {
      setEnv({ OPENDOCUMENTS_UI_THEME: 'dark' })
      const result = buildConfigFromEnv()
      expect(result?.ui?.theme).toBe('dark')
    })

    it('maps OPENDOCUMENTS_TELEMETRY_ENABLED = true', () => {
      setEnv({ OPENDOCUMENTS_TELEMETRY_ENABLED: 'true' })
      const result = buildConfigFromEnv()
      expect(result?.telemetry?.enabled).toBe(true)
    })

    it('maps OPENDOCUMENTS_TELEMETRY_ENABLED = false', () => {
      setEnv({ OPENDOCUMENTS_TELEMETRY_ENABLED: 'false' })
      const result = buildConfigFromEnv()
      expect(result?.telemetry?.enabled).toBe(false)
    })
  })

  describe('combined env var mappings', () => {
    it('maps multiple fields at once', () => {
      setEnv({
        OPENDOCUMENTS_WORKSPACE: 'prod',
        OPENDOCUMENTS_MODE: 'team',
        OPENDOCUMENTS_MODEL_PROVIDER: 'openai',
        OPENDOCUMENTS_MODEL_LLM: 'gpt-4o',
        OPENAI_API_KEY: 'sk-openai-xyz',
        OPENDOCUMENTS_RAG_PROFILE: 'precise',
        OPENDOCUMENTS_STORAGE_DB: 'postgres',
        OPENDOCUMENTS_TELEMETRY_ENABLED: 'true',
      })
      const result = buildConfigFromEnv()
      expect(result).not.toBeNull()
      expect(result?.workspace).toBe('prod')
      expect(result?.mode).toBe('team')
      expect(result?.model?.provider).toBe('openai')
      expect(result?.model?.llm).toBe('gpt-4o')
      expect(result?.model?.apiKey).toBe('sk-openai-xyz')
      expect(result?.rag?.profile).toBe('precise')
      expect(result?.storage?.db).toBe('postgres')
      expect(result?.telemetry?.enabled).toBe(true)
    })
  })
})
