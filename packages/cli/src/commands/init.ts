import { Command } from 'commander'
import { log } from 'opendocuments-core'
import chalk from 'chalk'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { cpus, totalmem, platform, arch } from 'node:os'

async function checkOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

async function getOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const data = await res.json() as { models?: Array<{ name: string }> }
    return (data.models || []).map(m => m.name)
  } catch {
    return []
  }
}

async function pullOllamaModel(model: string): Promise<boolean> {
  const { execSync } = await import('node:child_process')
  try {
    console.log(`  Pulling ${model}... (this may take a few minutes)`)
    execSync(`ollama pull ${model}`, { stdio: 'inherit', timeout: 600000 })
    return true
  } catch {
    return false
  }
}

async function validateCloudApiKey(provider: string, apiKey: string): Promise<boolean> {
  if (!apiKey) return true
  const endpoints: Record<string, { url: string; headers: Record<string, string> }> = {
    openai: {
      url: 'https://api.openai.com/v1/models',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    },
    anthropic: {
      url: 'https://api.anthropic.com/v1/messages',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    },
    google: {
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      headers: {},
    },
  }
  const endpoint = endpoints[provider]
  if (!endpoint) return true
  try {
    const res = await fetch(endpoint.url, {
      headers: endpoint.headers,
      signal: AbortSignal.timeout(10000),
    })
    return res.status !== 401 && res.status !== 403
  } catch {
    return true
  }
}

export function initCommand() {
  return new Command('init')
    .description('Initialize OpenDocuments project')
    .argument('[directory]', 'Project directory', '.')
    .action(async (dir) => {
      // Dynamic import to avoid loading inquirer when not needed
      const { input, select, confirm } = await import('@inquirer/prompts')

      log.heading('OpenDocuments Setup')
      log.blank()

      // 1. System detection
      const specs = detectSystem()
      log.info('System specs detected:')
      log.dim(`  CPU   ${specs.cpuModel} (${specs.cpuCores} cores)`)
      log.dim(`  RAM   ${specs.ramGB}GB`)
      log.dim(`  OS    ${specs.os} ${specs.arch}`)
      log.blank()

      // 2. Project name
      const projectName = await input({
        message: 'Project name:',
        default: 'my-docs',
      })

      // 3. Mode
      const mode = await select({
        message: 'Mode:',
        choices: [
          { name: 'Personal (single workspace)', value: 'personal' },
          { name: 'Team (multi-workspace + auth)', value: 'team' },
        ],
      })

      // 4. Model backend
      const backend = await select({
        message: 'Model backend:',
        choices: [
          { name: `Local (Ollama) ${chalk.dim('-- data stays on your machine')}`, value: 'ollama' },
          { name: `Cloud ${chalk.dim('-- OpenAI, Anthropic, Google, Grok')}`, value: 'cloud' },
        ],
      })

      let provider = 'ollama'
      let apiKey = ''
      let embeddingProvider: string | undefined
      let embeddingApiKey: string | undefined
      let llmModel = 'qwen2.5:14b'
      let embeddingModel = 'bge-m3'

      if (backend === 'cloud') {
        // 5. Cloud provider
        provider = await select({
          message: 'Cloud provider:',
          choices: [
            { name: 'OpenAI (GPT-4o)', value: 'openai' },
            { name: 'Anthropic (Claude)', value: 'anthropic' },
            { name: 'Google (Gemini)', value: 'google' },
            { name: 'Grok (xAI)', value: 'grok' },
          ],
        })

        // 6. API key
        const envVarMap: Record<string, string> = {
          openai: 'OPENAI_API_KEY',
          anthropic: 'ANTHROPIC_API_KEY',
          google: 'GOOGLE_API_KEY',
          grok: 'XAI_API_KEY',
        }

        apiKey = await input({
          message: `API Key (or set ${envVarMap[provider]} env var):`,
          default: '',
        })

        if (apiKey) {
          log.wait('Validating API key...')
          const valid = await validateCloudApiKey(provider, apiKey)
          if (valid) {
            log.ok('API key is valid')
          } else {
            log.fail('API key appears to be invalid (401/403 response)')
            const proceed = await confirm({
              message: 'Continue with this key anyway?',
              default: false,
            })
            if (!proceed) return
          }
        }

        // Set defaults based on provider
        const providerDefaults: Record<string, { llm: string; embedding: string }> = {
          openai: { llm: 'gpt-4o', embedding: 'text-embedding-3-small' },
          anthropic: { llm: 'claude-sonnet-4-20250514', embedding: 'bge-m3' }, // Anthropic has no embedding
          google: { llm: 'gemini-2.5-flash', embedding: 'text-embedding-004' },
          grok: { llm: 'grok-3', embedding: 'grok-2-embed' },
        }
        llmModel = providerDefaults[provider].llm
        embeddingModel = providerDefaults[provider].embedding

        if (provider === 'anthropic') {
          log.wait('Anthropic does not provide an embedding API.')
          const embeddingChoice = await select({
            message: 'Embedding provider:',
            choices: [
              { name: `Local (Ollama + BGE-M3) ${chalk.dim('-- requires Ollama running')}`, value: 'ollama' },
              { name: `OpenAI (text-embedding-3-small) ${chalk.dim('-- requires OpenAI API key')}`, value: 'openai' },
            ],
          })
          embeddingProvider = embeddingChoice
          if (embeddingChoice === 'openai') {
            embeddingModel = 'text-embedding-3-small'
            embeddingApiKey = await input({
              message: `OpenAI API Key for embeddings (or set OPENAI_API_KEY env var):`,
              default: '',
            })
          } else {
            embeddingModel = 'bge-m3'
          }
          log.info(`Embedding will use ${embeddingChoice === 'ollama' ? 'Ollama BGE-M3' : 'OpenAI text-embedding-3-small'}`)
        }
      } else {
        // Local model recommendation
        log.blank()
        log.info('Recommended models for your system:')

        if (specs.ramGB >= 32) {
          log.arrow(`${chalk.cyan('*')} Qwen 2.5 14B ${chalk.dim('(recommended -- Vision, Korean support)')}`)
          log.dim('    Llama 3.3 8B (lightweight)')
          log.dim('    EXAONE 7.8B (Korean specialized)')
        } else if (specs.ramGB >= 16) {
          log.arrow(`${chalk.cyan('*')} Qwen 2.5 7B ${chalk.dim('(recommended for 16GB RAM)')}`)
          log.dim('    Gemma 3 4B (lightweight)')
        } else {
          log.arrow(`${chalk.cyan('*')} Gemma 3 4B ${chalk.dim('(recommended for limited RAM)')}`)
          log.info('Limited RAM detected. Consider a cloud provider for better performance.')
        }

        llmModel = await input({
          message: 'LLM model:',
          default: specs.ramGB >= 32 ? 'qwen2.5:14b' : specs.ramGB >= 16 ? 'qwen2.5:7b' : 'gemma3:4b',
        })

        embeddingModel = await input({
          message: 'Embedding model:',
          default: 'bge-m3',
        })
      }

      // 7. RAG profile
      const profile = await select({
        message: 'RAG search profile:',
        choices: [
          { name: `fast ${chalk.dim('-- 10 docs, no reranking, ~1s response')}`, value: 'fast' },
          { name: `balanced ${chalk.dim('-- 20 docs, light reranking, ~3s response')}`, value: 'balanced' },
          { name: `precise ${chalk.dim('-- 50 docs, full reranking + web search, ~5s+')}`, value: 'precise' },
        ],
        default: 'balanced',
      })

      // 8. Plugin presets
      const preset = await select({
        message: 'Plugin preset:',
        choices: [
          { name: `Developer ${chalk.dim('-- GitHub, Swagger, code parser, Markdown')}`, value: 'developer' },
          { name: `Enterprise ${chalk.dim('-- Google Drive, Notion, Confluence, PDF, DOCX')}`, value: 'enterprise' },
          { name: `All ${chalk.dim('-- all connectors + all parsers')}`, value: 'all' },
          { name: 'Custom -- pick individually', value: 'custom' },
        ],
      })

      // 9. Generate config
      const projectDir = resolve(dir)
      if (!existsSync(projectDir)) {
        mkdirSync(projectDir, { recursive: true })
      }

      const configContent = generateConfigFile({
        projectName,
        mode: mode as 'personal' | 'team',
        provider,
        apiKey,
        embeddingProvider,
        embeddingApiKey,
        llmModel,
        embeddingModel,
        profile,
        preset,
      })

      const configPath = join(projectDir, 'opendocuments.config.ts')
      if (existsSync(configPath)) {
        const overwrite = await confirm({
          message: 'Config file already exists. Overwrite?',
          default: false,
        })
        if (!overwrite) {
          log.info('Aborted. Existing config preserved.')
          return
        }
      }
      writeFileSync(configPath, configContent)

      // Write .env file with the actual key (never written to config)
      const envVarName = getEnvVarName(provider)
      const envLines: string[] = []
      if (apiKey) envLines.push(`${envVarName}=${apiKey}`)
      if (embeddingApiKey) envLines.push(`OPENAI_API_KEY=${embeddingApiKey}`)
      if (envLines.length > 0) {
        writeFileSync(join(projectDir, '.env'), envLines.join('\n') + '\n')
        log.ok(`API key(s) saved to ${chalk.cyan('.env')} (add to .gitignore!)`)
      }

      // Write .gitignore if one doesn't exist
      const gitignorePath = join(projectDir, '.gitignore')
      if (!existsSync(gitignorePath)) {
        writeFileSync(gitignorePath, [
          'node_modules/',
          '.env',
          '.env.local',
          '*.db',
          '*.sqlite',
          '.opendocuments/',
          '',
        ].join('\n'))
        log.ok(`.gitignore created`)
      }

      // 9. Summary
      log.blank()
      log.heading('Setup Complete')
      log.ok(`Config written to ${chalk.cyan(configPath)}`)
      log.blank()
      log.info('Configuration:')
      log.dim(`  Mode       ${mode}`)
      log.dim(`  Provider   ${provider}`)
      log.dim(`  LLM        ${llmModel}`)
      log.dim(`  Embedding  ${embeddingModel}`)
      log.dim(`  Profile    ${profile}`)
      log.dim(`  Preset     ${preset}`)
      log.blank()
      log.heading('Next Steps')
      if (backend === 'ollama') {
        log.blank()
        log.wait('Checking Ollama availability...')
        const ollamaRunning = await checkOllamaRunning()
        if (ollamaRunning) {
          log.ok('Ollama is running')
          const models = await getOllamaModels()
          const needsPull: string[] = []
          for (const model of [llmModel, embeddingModel]) {
            if (models.some(m => m.startsWith(model.split(':')[0]))) {
              log.ok(`Model ${model} is available`)
            } else {
              needsPull.push(model)
            }
          }
          if (needsPull.length > 0) {
            const autoPull = await confirm({
              message: `Pull missing models (${needsPull.join(', ')})?`,
              default: true,
            })
            if (autoPull) {
              for (const model of needsPull) {
                const success = await pullOllamaModel(model)
                if (success) {
                  log.ok(`${model} pulled successfully`)
                } else {
                  log.fail(`Failed to pull ${model}. Run manually: ollama pull ${model}`)
                }
              }
            } else {
              log.arrow(`Pull models later: ollama pull ${needsPull.join(' && ollama pull ')}`)
            }
          }
        } else {
          log.fail('Ollama is not running or not installed')
          log.arrow('Install Ollama: https://ollama.com')
          log.arrow('Then start it:  ollama serve')
          log.arrow(`Then pull models: ollama pull ${llmModel} && ollama pull ${embeddingModel}`)
        }
      }
      if (backend === 'cloud' && !apiKey) {
        const envVarName = getEnvVarName(provider)
        log.arrow(`Set API key: export ${envVarName}=your-key-here`)
      }
      log.arrow(`${dir === '.' ? '' : `cd ${dir} && `}opendocuments start`)
      log.arrow('opendocuments index ./docs')
      log.arrow('opendocuments ask "your question"')
    })
}

interface SystemSpecs {
  cpuModel: string
  cpuCores: number
  ramGB: number
  os: string
  arch: string
}

function detectSystem(): SystemSpecs {
  const cpuInfo = cpus()
  return {
    cpuModel: cpuInfo[0]?.model || 'Unknown',
    cpuCores: cpuInfo.length,
    ramGB: Math.round(totalmem() / (1024 * 1024 * 1024)),
    os: platform(),
    arch: arch(),
  }
}

const PRESET_PLUGINS: Record<string, string[]> = {
  developer: ['@opendocuments/parser-code', '@opendocuments/connector-github'],
  enterprise: ['@opendocuments/parser-pdf', '@opendocuments/parser-docx', '@opendocuments/parser-xlsx', '@opendocuments/connector-gdrive', '@opendocuments/connector-notion', '@opendocuments/connector-confluence'],
  all: ['@opendocuments/parser-pdf', '@opendocuments/parser-docx', '@opendocuments/parser-xlsx', '@opendocuments/parser-html', '@opendocuments/parser-jupyter', '@opendocuments/parser-email', '@opendocuments/parser-code', '@opendocuments/connector-github', '@opendocuments/connector-notion', '@opendocuments/connector-gdrive', '@opendocuments/connector-s3', '@opendocuments/connector-confluence', '@opendocuments/connector-web-crawler'],
}

interface ConfigOptions {
  projectName: string
  mode: 'personal' | 'team'
  provider: string
  apiKey: string
  embeddingProvider?: string
  embeddingApiKey?: string
  llmModel: string
  embeddingModel: string
  profile: string
  preset: string
}

function generateConfigFile(opts: ConfigOptions): string {
  const lines = [
    `import { defineConfig } from 'opendocuments-core'`,
    ``,
    `export default defineConfig({`,
    `  workspace: '${opts.projectName}',`,
    `  mode: '${opts.mode}',`,
    ``,
    `  model: {`,
    `    provider: '${opts.provider}',`,
    `    llm: '${opts.llmModel}',`,
    `    embedding: '${opts.embeddingModel}',`,
  ]

  if (opts.embeddingProvider) {
    lines.push(`    embeddingProvider: '${opts.embeddingProvider}',`)
  }

  if (opts.apiKey) {
    lines.push(`    apiKey: process.env.${getEnvVarName(opts.provider)},`)
  }

  if (opts.embeddingApiKey || opts.embeddingProvider === 'openai') {
    lines.push(`    embeddingApiKey: process.env.OPENAI_API_KEY,`)
  }

  lines.push(
    `  },`,
    ``,
    `  rag: {`,
    `    profile: '${opts.profile}',`,
    `  },`,
    ``,
    `  storage: {`,
    `    db: 'sqlite',`,
    `    vectorDb: 'lancedb',`,
    `    dataDir: '~/.opendocuments',`,
    `  },`,
  )

  const presetPlugins = PRESET_PLUGINS[opts.preset] || []
  if (presetPlugins.length > 0) {
    lines.push(
      ``,
      `  plugins: [`,
      ...presetPlugins.map(p => `    '${p}',`),
      `  ],`,
    )
  } else {
    lines.push(
      ``,
      `  plugins: [],`,
    )
  }

  lines.push(`})`, ``)

  return lines.join('\n')
}

function getEnvVarName(provider: string): string {
  const map: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    grok: 'XAI_API_KEY',
    ollama: 'OLLAMA_URL',
  }
  return map[provider] || 'API_KEY'
}
