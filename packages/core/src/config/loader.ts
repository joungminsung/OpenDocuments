import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createJiti } from 'jiti'
import { configSchema, type OpenDocumentsConfig } from './schema.js'
import { DEFAULT_CONFIG } from './defaults.js'

export function validateConfig(raw: unknown): OpenDocumentsConfig {
  return configSchema.parse(raw)
}

export function loadConfig(projectDir: string): OpenDocumentsConfig {
  const tsPath = resolve(projectDir, 'opendocuments.config.ts')
  const jsPath = resolve(projectDir, 'opendocuments.config.js')

  const configPath = existsSync(tsPath) ? tsPath : existsSync(jsPath) ? jsPath : null

  if (!configPath) {
    return DEFAULT_CONFIG
  }

  try {
    const jiti = createJiti(import.meta.url, { interopDefault: true })
    const loaded = jiti(configPath) as Record<string, unknown>
    const raw = loaded.default ?? loaded

    const config = validateConfig(raw)
    const key = config.model?.apiKey
    if (key && (key.startsWith('sk-') || key.startsWith('od_live_'))) {
      console.warn('[!!] WARNING: API key detected in config. Consider using environment variables instead.')
    }
    return config
  } catch (err) {
    console.error(`\x1b[31m[ERROR] Failed to load config from ${configPath}:\x1b[0m`)
    console.error((err as Error).message)
    console.error('Fix your config file or delete it to use defaults:')
    console.error(`  rm ${configPath}`)
    console.error('  opendocuments init')
    process.exit(1)
  }
}

export function defineConfig(config: Partial<OpenDocumentsConfig>): OpenDocumentsConfig {
  return validateConfig(config)
}
