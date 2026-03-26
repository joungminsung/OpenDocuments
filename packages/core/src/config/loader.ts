import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { configSchema, type OpenDocsConfig } from './schema.js'
import { DEFAULT_CONFIG } from './defaults.js'

export function validateConfig(raw: unknown): OpenDocsConfig {
  return configSchema.parse(raw)
}

export function loadConfig(projectDir: string): OpenDocsConfig {
  const configPath = resolve(projectDir, 'opendocs.config.ts')
  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG
  }
  return DEFAULT_CONFIG
}

export function defineConfig(config: Partial<OpenDocsConfig>): OpenDocsConfig {
  return validateConfig(config)
}
