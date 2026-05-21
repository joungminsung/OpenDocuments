import type { OpenDocumentsConfig } from './schema.js'

/** Deep partial — makes every nested property optional. */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

/** Partial config as returned by this module before schema validation fills defaults. */
export type EnvConfig = DeepPartial<OpenDocumentsConfig>

/**
 * Provider names that have well-known API key environment variables.
 * Maps provider name → env var name.
 */
const PROVIDER_API_KEY_ENV: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  grok: 'GROK_API_KEY',
}

/**
 * All OPENDOCUMENTS_* env vars (excluding DATA_DIR, PROBE_RETRIES, PROBE_DELAY_MS
 * which are excluded from detection) that trigger env-based configuration.
 */
const DETECTED_VARS: ReadonlyArray<string> = [
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
]

/**
 * Build a partial OpenDocumentsConfig from environment variables.
 *
 * Returns `null` when no relevant OPENDOCUMENTS_* env vars are set (excluding
 * `DATA_DIR`, `PROBE_RETRIES`, and `PROBE_DELAY_MS` which are set by the
 * runtime and don't represent user configuration intent).
 *
 * Also maps well-known provider API key env vars (`OPENAI_API_KEY`,
 * `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GROK_API_KEY`) to `model.apiKey`
 * when `OPENDOCUMENTS_MODEL_PROVIDER` matches the provider and no explicit
 * `OPENDOCUMENTS_MODEL_API_KEY` is set.
 */
export function buildConfigFromEnv(): EnvConfig | null {
  const env = process.env

  // Detect whether the user actually provided any relevant env vars.
  const hasRelevantVars = DETECTED_VARS.some((key) => env[key] !== undefined)
  if (!hasRelevantVars) {
    return null
  }

  const config: EnvConfig = {}

  // ── Top-level ────────────────────────────────────────────────────────────
  if (env.OPENDOCUMENTS_WORKSPACE !== undefined) {
    config.workspace = env.OPENDOCUMENTS_WORKSPACE
  }

  if (env.OPENDOCUMENTS_MODE !== undefined) {
    const raw = env.OPENDOCUMENTS_MODE
    if (raw === 'personal' || raw === 'team') {
      config.mode = raw
    }
  }

  // ── Model ────────────────────────────────────────────────────────────────
  const modelVars = {
    provider: env.OPENDOCUMENTS_MODEL_PROVIDER,
    llm: env.OPENDOCUMENTS_MODEL_LLM,
    embedding: env.OPENDOCUMENTS_MODEL_EMBEDDING,
    embeddingProvider: env.OPENDOCUMENTS_MODEL_EMBEDDING_PROVIDER,
    apiKey: env.OPENDOCUMENTS_MODEL_API_KEY,
    baseUrl: env.OPENDOCUMENTS_MODEL_BASE_URL,
    embeddingDimensions: env.OPENDOCUMENTS_MODEL_EMBEDDING_DIMENSIONS,
  }

  const modelHasValue = Object.values(modelVars).some((v) => v !== undefined)

  // Resolve API key: explicit OPENDOCUMENTS_MODEL_API_KEY takes precedence;
  // fall back to the well-known key for the declared provider.
  let resolvedApiKey: string | undefined = modelVars.apiKey
  if (resolvedApiKey === undefined && modelVars.provider !== undefined) {
    const wellKnownVar = PROVIDER_API_KEY_ENV[modelVars.provider.toLowerCase()]
    if (wellKnownVar !== undefined) {
      resolvedApiKey = env[wellKnownVar]
    }
  }

  if (modelHasValue || resolvedApiKey !== undefined) {
    const model: EnvConfig['model'] = {}

    if (modelVars.provider !== undefined) model.provider = modelVars.provider
    if (modelVars.llm !== undefined) model.llm = modelVars.llm
    if (modelVars.embedding !== undefined) model.embedding = modelVars.embedding
    if (modelVars.embeddingProvider !== undefined) model.embeddingProvider = modelVars.embeddingProvider
    if (resolvedApiKey !== undefined) model.apiKey = resolvedApiKey
    if (modelVars.baseUrl !== undefined) model.baseUrl = modelVars.baseUrl

    if (modelVars.embeddingDimensions !== undefined) {
      const parsed = parseInt(modelVars.embeddingDimensions, 10)
      if (!isNaN(parsed)) {
        model.embeddingDimensions = parsed
      }
    }

    config.model = model
  }

  // ── RAG ──────────────────────────────────────────────────────────────────
  if (env.OPENDOCUMENTS_RAG_PROFILE !== undefined) {
    const raw = env.OPENDOCUMENTS_RAG_PROFILE
    if (raw === 'fast' || raw === 'balanced' || raw === 'precise' || raw === 'custom') {
      config.rag = { profile: raw }
    }
  }

  // ── Storage ──────────────────────────────────────────────────────────────
  const storageVars = {
    db: env.OPENDOCUMENTS_STORAGE_DB,
    vectorDb: env.OPENDOCUMENTS_STORAGE_VECTOR_DB,
    vectorDbUrl: env.OPENDOCUMENTS_STORAGE_VECTOR_DB_URL,
    dataDir: env.OPENDOCUMENTS_STORAGE_DATA_DIR,
  }

  const storageHasValue = Object.values(storageVars).some((v) => v !== undefined)
  if (storageHasValue) {
    const storage: EnvConfig['storage'] = {}

    if (storageVars.db !== undefined) {
      const raw = storageVars.db
      if (raw === 'sqlite' || raw === 'postgres') {
        storage.db = raw
      }
    }
    if (storageVars.vectorDb !== undefined) {
      const raw = storageVars.vectorDb
      if (raw === 'lancedb' || raw === 'qdrant') {
        storage.vectorDb = raw
      }
    }
    if (storageVars.vectorDbUrl !== undefined) storage.vectorDbUrl = storageVars.vectorDbUrl
    if (storageVars.dataDir !== undefined) storage.dataDir = storageVars.dataDir

    config.storage = storage
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  const uiVars = {
    locale: env.OPENDOCUMENTS_UI_LOCALE,
    theme: env.OPENDOCUMENTS_UI_THEME,
  }

  const uiHasValue = Object.values(uiVars).some((v) => v !== undefined)
  if (uiHasValue) {
    const ui: EnvConfig['ui'] = {}

    if (uiVars.locale !== undefined) ui.locale = uiVars.locale
    if (uiVars.theme !== undefined) {
      const raw = uiVars.theme
      if (raw === 'light' || raw === 'dark' || raw === 'auto') {
        ui.theme = raw
      }
    }

    config.ui = ui
  }

  // ── Telemetry ────────────────────────────────────────────────────────────
  if (env.OPENDOCUMENTS_TELEMETRY_ENABLED !== undefined) {
    config.telemetry = { enabled: env.OPENDOCUMENTS_TELEMETRY_ENABLED === 'true' }
  }

  return config
}
