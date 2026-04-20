import { Command } from 'commander'
import { log } from 'opendocuments-core'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

/**
 * Provider-specific diagnostic endpoints. Each entry is a GET that returns 200
 * when the API key is valid and reachable.
 */
const PROVIDER_DIAGNOSTICS: Record<string, {
  url: string | ((cfg: { baseUrl?: string; apiKey?: string }) => string)
  headers: (key: string) => Record<string, string>
  envVar: string
  docs: string
}> = {
  openai: {
    url: 'https://api.openai.com/v1/models',
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
    envVar: 'OPENAI_API_KEY',
    docs: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/models',
    headers: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
    envVar: 'ANTHROPIC_API_KEY',
    docs: 'https://console.anthropic.com/settings/keys',
  },
  google: {
    url: (cfg) => `https://generativelanguage.googleapis.com/v1beta/models?key=${cfg.apiKey ?? ''}`,
    headers: () => ({}),
    envVar: 'GOOGLE_API_KEY',
    docs: 'https://aistudio.google.com/apikey',
  },
  grok: {
    url: 'https://api.x.ai/v1/models',
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
    envVar: 'XAI_API_KEY',
    docs: 'https://console.x.ai',
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/models',
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
    envVar: 'DEEPSEEK_API_KEY',
    docs: 'https://platform.deepseek.com/api_keys',
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/models',
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
    envVar: 'MISTRAL_API_KEY',
    docs: 'https://console.mistral.ai/api-keys',
  },
  'openai-compatible': {
    url: (cfg) => `${cfg.baseUrl?.replace(/\/+$/, '')}/models`,
    headers: (k) => {
      const h: Record<string, string> = {}
      if (k) h.Authorization = `Bearer ${k}`
      return h
    },
    envVar: 'OPENAI_COMPATIBLE_API_KEY',
    docs: '(configured endpoint)',
  },
}

async function pingProvider(
  provider: string,
  cfg: { baseUrl?: string; apiKey?: string },
): Promise<{ ok: boolean; status?: number; message: string }> {
  const diag = PROVIDER_DIAGNOSTICS[provider]
  if (!diag) return { ok: false, message: `no diagnostic for provider '${provider}'` }
  const apiKey = cfg.apiKey ?? process.env[diag.envVar] ?? ''
  if (!apiKey && provider !== 'openai-compatible') {
    return { ok: false, message: `${diag.envVar} not set  (get a key: ${diag.docs})` }
  }
  const url = typeof diag.url === 'function' ? diag.url({ ...cfg, apiKey }) : diag.url
  if (!url || url.startsWith('undefined')) {
    return { ok: false, message: 'baseUrl is not set (openai-compatible requires it)' }
  }
  try {
    const res = await fetch(url, { headers: diag.headers(apiKey), signal: AbortSignal.timeout(10000) })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, message: `invalid API key (HTTP ${res.status})` }
    }
    if (!res.ok) {
      return { ok: false, status: res.status, message: `HTTP ${res.status}` }
    }
    return { ok: true, status: res.status, message: 'API reachable, key accepted' }
  } catch (err) {
    return { ok: false, message: (err as Error).message }
  }
}

export function doctorCommand() {
  return new Command('doctor')
    .description('Run health diagnostics')
    .action(async () => {
      log.heading('OpenDocuments Health Check')
      let hasIssues = false

      try {
        const ctx = await getContext()
        log.ok('Core           v0.1.0')

        // Test SQLite
        try {
          ctx.db.get('SELECT 1')
          log.ok('SQLite         connected')
        } catch {
          log.fail('SQLite         connection failed')
          hasIssues = true
        }

        // Test LanceDB / document store
        try {
          log.ok('LanceDB        connected')
          const docs = ctx.store.listDocuments()
          log.ok(`Documents      ${docs.length} indexed`)
        } catch {
          log.fail('LanceDB        connection failed')
          hasIssues = true
        }

        const workspaces = ctx.workspaceManager.list()
        log.ok(`Workspaces     ${workspaces.length}`)

        log.blank()
        log.heading('Plugins')
        for (const p of ctx.registry.listAll()) {
          const isStub = p.name.includes('stub')
          if (isStub) {
            log.fail(`${p.name.padEnd(35)} v${p.version} (DEGRADED)`)
            hasIssues = true
          } else {
            log.ok(`${p.name.padEnd(35)} v${p.version}`)
          }
        }

        log.blank()
        log.heading('Model Health')
        for (const model of ctx.registry.getModels()) {
          if (model.healthCheck) {
            try {
              const status = await model.healthCheck()
              if (status.healthy) {
                log.ok(`${model.name.padEnd(35)} healthy`)
              } else {
                log.fail(`${model.name.padEnd(35)} ${status.message ?? 'unhealthy'}`)
                hasIssues = true
              }
            } catch (err) {
              log.fail(`${model.name.padEnd(35)} healthCheck threw: ${(err as Error).message}`)
              hasIssues = true
            }
          } else {
            log.ok(`${model.name.padEnd(35)} (no healthCheck)`)
          }
        }

        // Provider-specific diagnostics (non-Ollama cloud/self-hosted)
        const provider = ctx.config.model.provider
        if (provider !== 'ollama' && PROVIDER_DIAGNOSTICS[provider]) {
          log.blank()
          log.heading(`${provider} Diagnostics`)
          const result = await pingProvider(provider, {
            apiKey: ctx.config.model.apiKey,
            baseUrl: ctx.config.model.baseUrl,
          })
          if (result.ok) {
            log.ok(`${provider.padEnd(15)} ${result.message}`)
          } else {
            log.fail(`${provider.padEnd(15)} ${result.message}`)
            hasIssues = true
          }

          // Also check secondary embedding provider if different
          const embProvider = ctx.config.model.embeddingProvider
          if (embProvider && embProvider !== provider && PROVIDER_DIAGNOSTICS[embProvider]) {
            const embResult = await pingProvider(embProvider, {
              apiKey: ctx.config.model.embeddingApiKey,
              baseUrl: ctx.config.model.baseUrl,
            })
            if (embResult.ok) {
              log.ok(`${embProvider.padEnd(15)} ${embResult.message}  (embedding)`)
            } else {
              log.fail(`${embProvider.padEnd(15)} ${embResult.message}  (embedding)`)
              hasIssues = true
            }
          }
        }

        // Ollama-specific diagnostics (primary provider OR secondary embedder)
        const usesOllama = provider === 'ollama' || ctx.config.model.embeddingProvider === 'ollama'
        if (usesOllama) {
          log.blank()
          log.heading('Ollama Diagnostics')

          const baseUrl = ctx.config.model.baseUrl || 'http://localhost:11434'
          const tagsUrl = `${baseUrl}/api/tags`

          let ollamaReachable = false
          let availableModels: string[] = []

          try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 3000)
            const res = await fetch(tagsUrl, { signal: controller.signal })
            clearTimeout(timeoutId)

            if (res.ok) {
              ollamaReachable = true
              const data = await res.json() as { models?: { name: string }[] }
              availableModels = (data.models ?? []).map((m) => m.name)
              log.ok(`Ollama         reachable at ${baseUrl}`)
            } else {
              log.fail(`Ollama         responded with HTTP ${res.status}`)
              hasIssues = true
            }
          } catch {
            log.fail(`Ollama         cannot connect to ${baseUrl}`)
            log.arrow('  Fix: ollama serve')
            log.arrow('  Install: https://ollama.com')
            hasIssues = true
          }

          if (ollamaReachable) {
            // Only check models that Ollama is actually responsible for.
            const ollamaModels: string[] = []
            if (ctx.config.model.provider === 'ollama') {
              ollamaModels.push(ctx.config.model.llm)
            }
            if (ctx.config.model.provider === 'ollama' || ctx.config.model.embeddingProvider === 'ollama') {
              ollamaModels.push(ctx.config.model.embedding)
            }
            const requiredModels = Array.from(new Set(ollamaModels))

            for (const required of requiredModels) {
              // Ollama tags may include ":latest" suffix; match on base name or exact name
              const found = availableModels.some(
                (m) => m === required || m === `${required}:latest` || m.startsWith(`${required}:`)
              )
              if (found) {
                log.ok(`Model          ${required}`)
              } else {
                log.fail(`Model          ${required} not found`)
                log.arrow(`  Fix: ollama pull ${required}`)
                hasIssues = true
              }
            }
          }
        }

        log.blank()
        if (hasIssues) {
          log.fail('Some checks failed.')
        } else {
          log.ok('All checks passed!')
        }
      } catch (err) {
        hasIssues = true
        const message = (err as Error).message
        log.fail(`Bootstrap failed: ${message}`)
        log.blank()
        log.info('Troubleshooting suggestions:')
        if (message.includes('ENOENT') || message.includes('no such file')) {
          log.arrow('  The data directory or config file may be missing. Run: opendocuments init')
        } else if (message.includes('SQLITE') || message.includes('database')) {
          log.arrow('  SQLite database may be corrupt. Try removing ~/.opendocuments/opendocuments.db and restarting.')
        } else if (message.includes('permission') || message.includes('EACCES')) {
          log.arrow('  Permission denied. Check ownership of ~/.opendocuments/')
        } else {
          log.arrow('  Run with DEBUG=1 for verbose output.')
          log.arrow('  Check logs at ~/.opendocuments/logs/ if available.')
        }
      } finally {
        await shutdownContext()
      }

      if (hasIssues) {
        process.exitCode = 1
      }
    })
}
