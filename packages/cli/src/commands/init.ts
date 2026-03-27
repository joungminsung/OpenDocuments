import { Command } from 'commander'
import { log } from '@opendocs/core'
import chalk from 'chalk'
import { writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { cpus, totalmem, platform, arch } from 'node:os'

export function initCommand() {
  return new Command('init')
    .description('Initialize OpenDocs project')
    .argument('[directory]', 'Project directory', '.')
    .action(async (dir) => {
      // Dynamic import to avoid loading inquirer when not needed
      const { input, select, confirm } = await import('@inquirer/prompts')

      log.heading('OpenDocs Setup')
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
          { name: `fast ${chalk.dim('-- quick answers, minimal resources')}`, value: 'fast' },
          { name: `balanced ${chalk.dim('-- recommended for most use cases')}`, value: 'balanced' },
          { name: `precise ${chalk.dim('-- thorough search, more resources')}`, value: 'precise' },
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

      const configPath = join(projectDir, 'opendocs.config.ts')
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
          '.opendocs/',
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
        log.arrow('Install Ollama: https://ollama.com')
        log.arrow(`Pull models: ollama pull ${llmModel} && ollama pull ${embeddingModel}`)
      }
      if (backend === 'cloud') {
        log.arrow(`Set API key: export ${envVarName}=your-key-here`)
      }
      log.arrow(`${dir === '.' ? '' : `cd ${dir} && `}opendocs start`)
      log.arrow('opendocs index ./docs')
      log.arrow('opendocs ask "your question"')
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
  developer: ['@opendocs/parser-code', '@opendocs/connector-github'],
  enterprise: ['@opendocs/parser-pdf', '@opendocs/parser-docx', '@opendocs/parser-xlsx', '@opendocs/connector-gdrive', '@opendocs/connector-notion', '@opendocs/connector-confluence'],
  all: ['@opendocs/parser-pdf', '@opendocs/parser-docx', '@opendocs/parser-xlsx', '@opendocs/parser-html', '@opendocs/parser-jupyter', '@opendocs/parser-email', '@opendocs/parser-code', '@opendocs/connector-github', '@opendocs/connector-notion', '@opendocs/connector-gdrive', '@opendocs/connector-s3', '@opendocs/connector-confluence', '@opendocs/connector-web-crawler'],
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
    `import { defineConfig } from '@opendocs/core'`,
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
    `    dataDir: '~/.opendocs',`,
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
