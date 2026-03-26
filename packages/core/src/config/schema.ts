import { z } from 'zod'

export const ragProfileSchema = z.enum(['fast', 'balanced', 'precise', 'custom'])

export const securitySchema = z.object({
  dataPolicy: z.object({
    allowCloudProcessing: z.boolean().default(true),
    autoRedact: z.object({
      enabled: z.boolean().default(false),
      patterns: z.array(z.string()).default([]),
      method: z.enum(['replace', 'hash', 'remove']).default('replace'),
      replacement: z.string().default('[REDACTED]'),
    }).default({}),
    sourceRestrictions: z.object({
      localOnly: z.array(z.string()).default([]),
      cloudAllowed: z.array(z.string()).default([]),
    }).default({}),
    workspaceOverrides: z.record(z.object({
      allowCloudProcessing: z.boolean().optional(),
    })).default({}),
  }).default({}),
  transport: z.object({
    enforceHTTPS: z.boolean().default(true),
    proxy: z.string().optional(),
    allowedEndpoints: z.array(z.string()).default([]),
  }).default({}),
  storage: z.object({
    encryptAtRest: z.boolean().default(false),
    encryptionKey: z.string().optional(),
    redactLogsContent: z.boolean().default(true),
  }).default({}),
  audit: z.object({
    enabled: z.boolean().default(false),
    events: z.array(z.string()).default([]),
    destination: z.enum(['local', 'syslog', 'webhook']).default('local'),
  }).default({}),
}).default({})

export const configSchema = z.object({
  workspace: z.string().default('default'),
  mode: z.enum(['personal', 'team']).default('personal'),
  model: z.object({
    provider: z.string().default('ollama'),
    llm: z.string().default('qwen2.5:14b'),
    embedding: z.string().default('bge-m3'),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    embeddingDimensions: z.number().optional(),
  }).default({}),
  rag: z.object({
    profile: ragProfileSchema.default('balanced'),
    custom: z.object({
      retrieval: z.object({
        k: z.number().default(20),
        minScore: z.number().default(0.3),
        finalTopK: z.number().default(5),
      }).default({}),
      context: z.object({
        maxTokens: z.number().default(4096),
        historyMaxTokens: z.number().default(1024),
      }).default({}),
    }).optional(),
  }).default({}),
  connectors: z.array(z.object({
    type: z.string(),
    path: z.string().optional(),
    repo: z.string().optional(),
    watch: z.boolean().default(false),
  }).passthrough()).default([]),
  plugins: z.array(z.string()).default([]),
  parserFallbacks: z.record(z.array(z.string())).default({}),
  security: securitySchema,
  ui: z.object({
    locale: z.string().default('auto'),
    theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  }).default({}),
  telemetry: z.object({
    enabled: z.boolean().default(false),
  }).default({}),
  storage: z.object({
    db: z.enum(['sqlite', 'postgres']).default('sqlite'),
    dbUrl: z.string().optional(),
    vectorDb: z.enum(['lancedb', 'qdrant']).default('lancedb'),
    vectorDbUrl: z.string().optional(),
    dataDir: z.string().default('~/.opendocs'),
  }).default({}),
})

export type OpenDocsConfig = z.infer<typeof configSchema>
