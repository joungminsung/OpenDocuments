import { Command } from 'commander'
import { log, loadConfig } from 'opendocuments-core'
import chalk from 'chalk'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  deleteOllamaModel,
  estimateModelSize,
  formatBytes,
  getAvailableDiskBytes,
  getOllamaInstallCommand,
  isOllamaRunning,
  listOllamaModels,
  pullOllamaModel,
} from '../utils/ollama.js'

/* ------------------------------------------------------------------ */
/*  Curated suggestion catalog (April 2026)                           */
/* ------------------------------------------------------------------ */

interface Suggestion {
  tag: string
  description: string
  size: string
  provider: 'ollama' | 'cloud'
}

const LOCAL_SUGGESTIONS: Suggestion[] = [
  // Google Gemma family
  { tag: 'gemma3:27b', description: 'Google Gemma 3 27B — 128K ctx, multimodal, 140+ languages', size: '~17GB', provider: 'ollama' },
  { tag: 'gemma3:12b', description: 'Gemma 3 12B — balanced, 128K ctx', size: '~7.5GB', provider: 'ollama' },
  { tag: 'gemma3:4b', description: 'Gemma 3 4B — low-spec friendly', size: '~2.5GB', provider: 'ollama' },
  { tag: 'gemma3n', description: 'Gemma 3n — selective activation for laptops/phones', size: '~2.8GB', provider: 'ollama' },
  // Qwen
  { tag: 'qwen2.5:14b', description: 'Qwen 2.5 14B — vision + Korean (legacy default)', size: '~9GB', provider: 'ollama' },
  { tag: 'qwen3.5:9b', description: 'Qwen 3.5 9B — general, Korean excellent', size: '~5.5GB', provider: 'ollama' },
  { tag: 'qwen3.5:27b', description: 'Qwen 3.5 27B — flagship local model', size: '~17GB', provider: 'ollama' },
  // Meta Llama
  { tag: 'llama4:scout', description: 'Llama 4 Scout — 10M context, MoE', size: '~65GB', provider: 'ollama' },
  { tag: 'llama4:maverick', description: 'Llama 4 Maverick — top open-source quality', size: '~230GB', provider: 'ollama' },
  // DeepSeek (distilled for local)
  { tag: 'deepseek-r1:14b', description: 'DeepSeek R1 distilled 14B — reasoning', size: '~9GB', provider: 'ollama' },
  // Embeddings
  { tag: 'bge-m3', description: 'BGE-M3 — best open embedding, 1024-dim', size: '~1.2GB', provider: 'ollama' },
  { tag: 'nomic-embed-text', description: 'nomic-embed-text — lightweight 768-dim', size: '~300MB', provider: 'ollama' },
]

const CLOUD_SUGGESTIONS: Suggestion[] = [
  { tag: 'openai:gpt-4o', description: 'OpenAI GPT-4o — general purpose, vision', size: 'API', provider: 'cloud' },
  { tag: 'anthropic:claude-sonnet-4-20250514', description: 'Claude Sonnet 4 — long context, coding', size: 'API', provider: 'cloud' },
  { tag: 'google:gemini-2.5-flash', description: 'Gemini 2.5 Flash — multimodal', size: 'API', provider: 'cloud' },
  { tag: 'deepseek:deepseek-chat', description: 'DeepSeek V3.2 — $0.26/Mtok, 164K ctx', size: 'API', provider: 'cloud' },
  { tag: 'deepseek:deepseek-reasoner', description: 'DeepSeek R1 — reasoning specialist', size: 'API', provider: 'cloud' },
  { tag: 'mistral:mistral-small-latest', description: 'Mistral Small 4 — MoE w/ reasoning + vision + code', size: 'API', provider: 'cloud' },
  { tag: 'mistral:mistral-large-latest', description: 'Mistral Large 2.1 — flagship reasoning', size: 'API', provider: 'cloud' },
  { tag: 'grok:grok-4', description: 'xAI Grok 4 — real-time knowledge', size: 'API', provider: 'cloud' },
]

/* ------------------------------------------------------------------ */
/*  Command                                                           */
/* ------------------------------------------------------------------ */

export function modelCommand() {
  const cmd = new Command('model').description('Manage LLM / embedding models')

  // ---------- list ----------
  cmd.command('list')
    .alias('ls')
    .description('Show configured + locally installed models and suggestions')
    .option('--suggestions', 'Also print curated model suggestions')
    .action(async (opts) => {
      const config = loadConfig(process.cwd())
      const baseUrl = config.model.baseUrl || 'http://localhost:11434'

      log.heading('Current configuration')
      log.dim(`  provider          ${config.model.provider}`)
      log.dim(`  llm               ${config.model.llm}`)
      log.dim(`  embedding         ${config.model.embedding}`)
      if (config.model.embeddingProvider) {
        log.dim(`  embeddingProvider ${config.model.embeddingProvider}`)
      }
      if (config.model.baseUrl) {
        log.dim(`  baseUrl           ${config.model.baseUrl}`)
      }
      log.blank()

      if (config.model.provider === 'ollama' || config.model.embeddingProvider === 'ollama') {
        log.heading(`Installed Ollama models @ ${baseUrl}`)
        const reachable = await isOllamaRunning(baseUrl)
        if (!reachable) {
          log.fail(`Ollama not reachable at ${baseUrl}`)
          log.arrow('Start Ollama with: ollama serve')
        } else {
          const models = await listOllamaModels(baseUrl)
          if (models.length === 0) {
            log.info('No local models installed.')
            log.arrow(`Pull one:  opendocuments model pull ${config.model.llm}`)
          } else {
            for (const m of models) {
              const params = m.details?.parameter_size ?? ''
              const quant = m.details?.quantization_level ?? ''
              const tag = params || quant ? chalk.dim(`  (${[params, quant].filter(Boolean).join(', ')})`) : ''
              console.log(`  ${chalk.cyan(m.name.padEnd(32))} ${formatBytes(m.size).padStart(8)}${tag}`)
            }
          }
        }
        log.blank()
      }

      if (opts.suggestions) {
        log.heading('Suggested local models (ollama pull)')
        for (const s of LOCAL_SUGGESTIONS) {
          console.log(`  ${chalk.cyan(s.tag.padEnd(32))} ${s.size.padStart(8)}  ${chalk.dim(s.description)}`)
        }
        log.blank()
        log.heading('Suggested cloud providers')
        for (const s of CLOUD_SUGGESTIONS) {
          console.log(`  ${chalk.cyan(s.tag.padEnd(48))} ${chalk.dim(s.description)}`)
        }
        log.blank()
        log.arrow('See all: https://ollama.com/library')
      } else {
        log.arrow('Run with --suggestions to see popular models you can install')
      }
    })

  // ---------- pull (one or many) ----------
  cmd.command('pull <names...>')
    .description('Pull one or more Ollama models (checks disk space, shows progress)')
    .option('--base-url <url>', 'Ollama base URL', 'http://localhost:11434')
    .option('--yes', 'Skip disk space confirmation')
    .action(async (names: string[], opts: { baseUrl: string; yes?: boolean }) => {
      const reachable = await isOllamaRunning(opts.baseUrl)
      if (!reachable) {
        log.fail(`Ollama not reachable at ${opts.baseUrl}`)
        const install = getOllamaInstallCommand()
        if (install.supported) {
          log.arrow(`Install:  opendocuments model install-ollama`)
          log.arrow(`  or:     ${install.command}`)
        } else {
          log.arrow(`Download:  ${install.url}`)
        }
        log.arrow('Then:     ollama serve')
        process.exitCode = 1
        return
      }

      // Combined disk-space pre-check (sum across all requested models).
      const estimates = names.map((n) => ({ name: n, size: estimateModelSize(n) }))
      const totalEstimate = estimates.reduce((acc, e) => acc + (e.size ?? 0), 0)
      const available = getAvailableDiskBytes()
      const margin = 1.5e9
      if (totalEstimate > 0) {
        log.info(`Estimated footprint:`)
        for (const e of estimates) {
          const line = e.size
            ? `  ${e.name.padEnd(24)} ~${formatBytes(e.size)}`
            : `  ${e.name.padEnd(24)} (size unknown)`
          console.log(line)
        }
        if (names.length > 1) {
          log.info(`  ${'total'.padEnd(24)} ~${formatBytes(totalEstimate)}`)
        }
        if (available !== null) {
          log.info(`Available disk:  ${formatBytes(available)}`)
          if (available < totalEstimate + margin) {
            log.fail(
              `Not enough free disk space (need ~${formatBytes(totalEstimate + margin)}, have ${formatBytes(available)}).`,
            )
            if (!opts.yes) {
              const { confirm } = await import('@inquirer/prompts')
              const proceed = await confirm({ message: 'Pull anyway?', default: false })
              if (!proceed) return
            }
          }
        }
      }

      const failures: string[] = []
      for (const [i, name] of names.entries()) {
        if (names.length > 1) {
          log.blank()
          log.heading(`[${i + 1}/${names.length}] ${name}`)
        }
        log.wait(`Pulling ${chalk.cyan(name)} ...`)
        let lastPrinted = ''
        const ok = await pullOllamaModel(name, opts.baseUrl, (line) => {
          if (line !== lastPrinted) {
            lastPrinted = line
            process.stdout.write(`\r\x1b[K  ${line}`)
          }
        })
        process.stdout.write('\n')

        if (ok) log.ok(`Pulled ${name}`)
        else {
          log.fail(`Failed to pull ${name}`)
          failures.push(name)
        }
      }

      if (failures.length > 0) {
        log.blank()
        log.fail(`${failures.length}/${names.length} pulls failed: ${failures.join(', ')}`)
        log.arrow(`Retry manually:  ${failures.map((f) => `ollama pull ${f}`).join(' && ')}`)
        process.exitCode = 1
      }
    })

  // ---------- install-ollama ----------
  cmd.command('install-ollama')
    .description('Install Ollama via the official script (macOS/Linux)')
    .option('--yes', 'Skip confirmation')
    .action(async (opts: { yes?: boolean }) => {
      const install = getOllamaInstallCommand()
      if (!install.supported) {
        log.fail('Automatic install is not supported on this platform (Windows).')
        log.arrow(`Download manually: ${install.url}`)
        process.exitCode = 1
        return
      }

      if (await isOllamaRunning()) {
        log.ok('Ollama is already running at http://localhost:11434')
        return
      }

      log.info('About to run the official Ollama install script:')
      log.dim(`  ${install.command}`)
      log.blank()
      if (!opts.yes) {
        const { confirm } = await import('@inquirer/prompts')
        const go = await confirm({ message: 'Proceed?', default: true })
        if (!go) return
      }

      const { execSync } = await import('node:child_process')
      try {
        execSync(install.command!, { stdio: 'inherit' })
      } catch (err) {
        log.fail(`Install failed: ${(err as Error).message}`)
        process.exitCode = 1
        return
      }

      log.wait('Waiting for Ollama daemon to come up...')
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1500))
        if (await isOllamaRunning()) {
          log.ok('Ollama is running')
          log.arrow('Next: opendocuments model pull gemma3:12b')
          return
        }
      }
      log.fail('Ollama did not come up within 15s. Try: ollama serve')
      process.exitCode = 1
    })

  // ---------- set-key ----------
  cmd.command('set-key <provider>')
    .description('Save an API key to .env for the given provider')
    .option('--key <value>', 'Pass the key inline (otherwise prompted)')
    .option('--env-file <path>', 'Path to .env file', '.env')
    .action(async (provider: string, opts: { key?: string; envFile: string }) => {
      const envVar = envVarForProvider(provider)
      if (!envVar) {
        log.fail(`Unknown provider: ${provider}`)
        log.arrow('Supported: openai, anthropic, google, grok, deepseek, mistral, openai-compatible')
        process.exitCode = 1
        return
      }

      let key = opts.key
      if (!key) {
        const { password } = await import('@inquirer/prompts')
        key = await password({ message: `Enter ${envVar} (input hidden):`, mask: '*' })
      }
      if (!key) {
        log.fail('Empty key — aborting.')
        process.exitCode = 1
        return
      }

      const envPath = join(process.cwd(), opts.envFile)
      const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
      const pattern = new RegExp(`^${envVar}=.*$`, 'm')

      let next: string
      if (pattern.test(existing)) {
        next = existing.replace(pattern, `${envVar}=${key}`)
      } else {
        const needsNewline = existing && !existing.endsWith('\n')
        next = existing + (needsNewline ? '\n' : '') + `${envVar}=${key}\n`
      }
      writeFileSync(envPath, next)
      log.ok(`Wrote ${envVar} to ${chalk.cyan(opts.envFile)}`)

      // gitignore sanity check
      const gitignorePath = join(process.cwd(), '.gitignore')
      if (existsSync(gitignorePath)) {
        const gi = readFileSync(gitignorePath, 'utf8')
        if (!/^\.env($|\n)/m.test(gi) && !gi.split('\n').some((l) => l.trim() === '.env')) {
          log.fail('.env is NOT in .gitignore — your key could leak if committed.')
          log.arrow('Add to .gitignore:  .env')
        }
      } else {
        log.info('No .gitignore found — consider creating one with `.env` listed.')
      }

      log.arrow('Validate with:  opendocuments doctor')
    })

  // ---------- rm ----------
  cmd.command('rm <name>')
    .alias('remove')
    .description('Delete an Ollama model')
    .option('--base-url <url>', 'Ollama base URL', 'http://localhost:11434')
    .option('--yes', 'Skip confirmation')
    .action(async (name: string, opts: { baseUrl: string; yes?: boolean }) => {
      if (!opts.yes) {
        const { confirm } = await import('@inquirer/prompts')
        const yes = await confirm({ message: `Delete local model ${name}?`, default: false })
        if (!yes) return
      }
      const ok = await deleteOllamaModel(name, opts.baseUrl)
      if (ok) log.ok(`Removed ${name}`)
      else {
        log.fail(`Failed to remove ${name}`)
        process.exitCode = 1
      }
    })

  // ---------- test ----------
  cmd.command('test')
    .description('Run a quick round-trip test against the configured model')
    .option('-p, --prompt <text>', 'Prompt to send', 'Say "pong" and nothing else.')
    .action(async (opts: { prompt: string }) => {
      const { getContext, shutdownContext } = await import('../utils/bootstrap.js')
      try {
        const ctx = await getContext()
        const llm = ctx.registry.getModels().find((m) => m.capabilities.llm && m.generate)
        if (!llm || !llm.generate) {
          log.fail('No LLM model registered')
          process.exitCode = 1
          return
        }
        log.info(`Testing ${llm.name}`)
        log.dim(`> ${opts.prompt}`)
        const start = Date.now()
        let output = ''
        let chunks = 0
        for await (const chunk of llm.generate(opts.prompt, { maxTokens: 64, temperature: 0.1 })) {
          output += chunk
          chunks++
        }
        const elapsed = Date.now() - start
        log.blank()
        console.log(chalk.cyan(`< ${output.trim()}`))
        log.blank()
        log.ok(`Round-trip ok: ${chunks} chunks, ${elapsed}ms`)

        // Embedding round-trip too
        const embedder = ctx.registry.getModels().find((m) => m.capabilities.embedding && m.embed)
        if (embedder && embedder.embed) {
          const embStart = Date.now()
          const result = await embedder.embed(['test'])
          const dim = result.dense[0]?.length ?? 0
          log.ok(`Embedding ok: ${dim}-dim, ${Date.now() - embStart}ms  (${embedder.name})`)
        }
      } catch (err) {
        log.fail(`Test failed: ${(err as Error).message}`)
        process.exitCode = 1
      } finally {
        await shutdownContext()
      }
    })

  // ---------- switch ----------
  cmd.command('switch')
    .description('Change the active model provider (edits opendocuments.config.ts)')
    .action(async () => {
      const configPath = join(process.cwd(), 'opendocuments.config.ts')
      if (!existsSync(configPath)) {
        log.fail('No config file found in current directory.')
        log.arrow('Run:  opendocuments init')
        process.exitCode = 1
        return
      }

      const { select, input } = await import('@inquirer/prompts')
      const provider = await select({
        message: 'Switch to provider:',
        choices: [
          { name: 'Ollama (local)', value: 'ollama' },
          { name: 'OpenAI', value: 'openai' },
          { name: 'Anthropic', value: 'anthropic' },
          { name: 'Google', value: 'google' },
          { name: 'Grok (xAI)', value: 'grok' },
          { name: 'DeepSeek', value: 'deepseek' },
          { name: 'Mistral', value: 'mistral' },
          { name: 'OpenAI-compatible (vLLM/LM Studio/Groq/Together/…)', value: 'openai-compatible' },
        ],
      })

      const defaults: Record<string, { llm: string; embedding: string; embeddingProvider?: string }> = {
        ollama: { llm: 'qwen2.5:14b', embedding: 'bge-m3' },
        openai: { llm: 'gpt-4o', embedding: 'text-embedding-3-small' },
        anthropic: { llm: 'claude-sonnet-4-20250514', embedding: 'bge-m3', embeddingProvider: 'ollama' },
        google: { llm: 'gemini-2.5-flash', embedding: 'text-embedding-004' },
        grok: { llm: 'grok-4', embedding: 'grok-2-embed' },
        deepseek: { llm: 'deepseek-chat', embedding: 'bge-m3', embeddingProvider: 'ollama' },
        mistral: { llm: 'mistral-small-latest', embedding: 'mistral-embed' },
        'openai-compatible': { llm: '', embedding: 'bge-m3', embeddingProvider: 'ollama' },
      }

      const llm = await input({ message: 'LLM model:', default: defaults[provider].llm })
      const embedding = await input({ message: 'Embedding model:', default: defaults[provider].embedding })

      let baseUrl = ''
      if (provider === 'openai-compatible') {
        baseUrl = await input({ message: 'baseUrl (OpenAI-compatible endpoint):', default: 'https://api.groq.com/openai/v1' })
      }

      const src = readFileSync(configPath, 'utf8')
      const updated = rewriteModelBlock(src, {
        provider,
        llm,
        embedding,
        embeddingProvider: defaults[provider].embeddingProvider,
        baseUrl,
      })

      writeFileSync(configPath, updated)
      log.ok(`Updated ${configPath} → provider=${provider}, llm=${llm}`)
      log.arrow('Restart:  opendocuments start')
      if (provider !== 'ollama') {
        const envVar = envVarName(provider)
        log.arrow(`Set API key: export ${envVar}=...   (or put it in .env)`)
      }
    })

  return cmd
}

/* ------------------------------------------------------------------ */
/*  Config rewriting                                                  */
/* ------------------------------------------------------------------ */

interface ModelBlockUpdate {
  provider: string
  llm: string
  embedding: string
  embeddingProvider?: string
  baseUrl?: string
}

/**
 * Rewrite the `model: { ... }` block in opendocuments.config.ts.
 * This is a best-effort string rewrite for the common cases produced by `init`.
 * Preserves surrounding config — throws if the model block can't be located.
 */
export function rewriteModelBlock(src: string, update: ModelBlockUpdate): string {
  const re = /model:\s*\{[\s\S]*?\n\s*\},/m
  if (!re.test(src)) {
    throw new Error('Could not locate `model: { ... }` block in config file — edit it manually.')
  }

  const lines = [
    `model: {`,
    `    provider: '${update.provider}',`,
    update.llm ? `    llm: '${update.llm}',` : null,
    `    embedding: '${update.embedding}',`,
    update.embeddingProvider ? `    embeddingProvider: '${update.embeddingProvider}',` : null,
    update.baseUrl ? `    baseUrl: '${update.baseUrl}',` : null,
    update.provider !== 'ollama' ? `    apiKey: process.env.${envVarName(update.provider)},` : null,
    update.embeddingProvider === 'openai' ? `    embeddingApiKey: process.env.OPENAI_API_KEY,` : null,
    `  },`,
  ].filter(Boolean).join('\n  ')

  return src.replace(re, lines)
}

function envVarName(provider: string): string {
  const map: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    grok: 'XAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    'openai-compatible': 'OPENAI_COMPATIBLE_API_KEY',
    ollama: 'OLLAMA_URL',
  }
  return map[provider] || 'API_KEY'
}

/** Like envVarName but returns null for unknown providers (used by set-key). */
function envVarForProvider(provider: string): string | null {
  const map: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    grok: 'XAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    'openai-compatible': 'OPENAI_COMPATIBLE_API_KEY',
  }
  return map[provider] ?? null
}
