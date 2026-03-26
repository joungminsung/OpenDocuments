import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createJiti } from 'jiti'
import { configSchema, type OpenDocsConfig } from './schema.js'
import { DEFAULT_CONFIG } from './defaults.js'

export function validateConfig(raw: unknown): OpenDocsConfig {
  return configSchema.parse(raw)
}

export function loadConfig(projectDir: string): OpenDocsConfig {
  const tsPath = resolve(projectDir, 'opendocs.config.ts')
  const jsPath = resolve(projectDir, 'opendocs.config.js')

  const configPath = existsSync(tsPath) ? tsPath : existsSync(jsPath) ? jsPath : null

  if (!configPath) {
    return DEFAULT_CONFIG
  }

  try {
    const jiti = createJiti(import.meta.url, { interopDefault: true })
    const loaded = jiti(configPath) as Record<string, unknown>
    const raw = loaded.default ?? loaded

    return validateConfig(raw)
  } catch (err) {
    console.warn(`Failed to load config from ${configPath}: ${(err as Error).message}`)
    console.warn('Using default configuration.')
    return DEFAULT_CONFIG
  }
}

export function defineConfig(config: Partial<OpenDocsConfig>): OpenDocsConfig {
  return validateConfig(config)
}
