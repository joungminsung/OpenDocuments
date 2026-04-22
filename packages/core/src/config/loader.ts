import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createJiti } from 'jiti'
import { configSchema, type OpenDocumentsConfig } from './schema.js'
import { DEFAULT_CONFIG } from './defaults.js'
import { buildConfigFromEnv } from './env-loader.js'

export function validateConfig(raw: unknown): OpenDocumentsConfig {
  return configSchema.parse(raw)
}

export function loadConfig(projectDir: string): OpenDocumentsConfig {
  // Load .env file if present (before config resolution so process.env refs work)
  const envPath = resolve(projectDir, '.env')
  if (existsSync(envPath)) {
    try {
      const envContent = readFileSync(envPath, 'utf-8')
      for (const line of envContent.split('\n')) {
        let trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        // Handle 'export KEY=value' syntax
        if (trimmed.startsWith('export ')) trimmed = trimmed.slice(7).trim()
        const eqIndex = trimmed.indexOf('=')
        if (eqIndex === -1) continue
        const key = trimmed.slice(0, eqIndex).trim()
        let value = trimmed.slice(eqIndex + 1).trim()
        // Strip inline comments (only if unquoted)
        if (!value.startsWith('"') && !value.startsWith("'")) {
          const commentIdx = value.indexOf(' #')
          if (commentIdx !== -1) value = value.slice(0, commentIdx).trim()
        }
        // Strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        // Handle escaped characters in double-quoted values
        value = value.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"')
        if (key && !process.env[key]) {
          process.env[key] = value
        }
      }
    } catch {
      // .env read failed — continue without it
    }
  }

  const tsPath = resolve(projectDir, 'opendocuments.config.ts')
  const jsPath = resolve(projectDir, 'opendocuments.config.js')

  const configPath = existsSync(tsPath) ? tsPath : existsSync(jsPath) ? jsPath : null

  if (!configPath) {
    const envConfig = buildConfigFromEnv()
    if (envConfig !== null) {
      return validateConfig(envConfig)
    }
    console.warn('\x1b[33m[WARN] No config file found. Using defaults (Ollama on localhost).\x1b[0m')
    console.warn('  Run: opendocuments init')
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
    const message = (err as Error).message
    throw new Error(
      `Failed to load config from ${configPath}: ${message}\n` +
      `Fix your config file or delete it to use defaults:\n` +
      `  rm ${configPath}\n` +
      `  opendocuments init`
    )
  }
}

export function defineConfig(config: Partial<OpenDocumentsConfig>): OpenDocumentsConfig {
  return validateConfig(config)
}
