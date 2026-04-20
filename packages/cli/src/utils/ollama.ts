import { statfsSync } from 'node:fs'
import { homedir, platform } from 'node:os'

export interface OllamaModelInfo {
  name: string
  size: number
  digest?: string
  modified_at?: string
  details?: {
    parameter_size?: string
    quantization_level?: string
    family?: string
  }
}

export async function isOllamaRunning(baseUrl = 'http://localhost:11434'): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

export async function listOllamaModels(baseUrl = 'http://localhost:11434'): Promise<OllamaModelInfo[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return []
    const data = (await res.json()) as { models?: OllamaModelInfo[] }
    return data.models ?? []
  } catch {
    return []
  }
}

/**
 * Pull an Ollama model with progress streaming.
 * Yields human-readable progress lines; resolves with true on success, false on failure.
 */
export async function pullOllamaModel(
  model: string,
  baseUrl = 'http://localhost:11434',
  onProgress?: (line: string) => void,
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
    })
    if (!res.ok || !res.body) return false

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let lastStatus = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const evt = JSON.parse(line) as {
            status?: string
            total?: number
            completed?: number
            error?: string
          }
          if (evt.error) {
            onProgress?.(`error: ${evt.error}`)
            return false
          }
          if (evt.status && evt.status !== lastStatus) {
            lastStatus = evt.status
            if (evt.total && evt.completed !== undefined) {
              const pct = ((evt.completed / evt.total) * 100).toFixed(1)
              onProgress?.(`${evt.status} — ${pct}% (${formatBytes(evt.completed)}/${formatBytes(evt.total)})`)
            } else {
              onProgress?.(evt.status)
            }
          } else if (evt.status === lastStatus && evt.total && evt.completed !== undefined) {
            const pct = ((evt.completed / evt.total) * 100).toFixed(1)
            onProgress?.(`${evt.status} — ${pct}%`)
          }
        } catch {
          // skip unparseable lines
        }
      }
    }
    return true
  } catch (err) {
    onProgress?.(`error: ${(err as Error).message}`)
    return false
  }
}

export async function deleteOllamaModel(
  model: string,
  baseUrl = 'http://localhost:11434',
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Best-effort available disk space in bytes for a given directory. Returns null on
 * unsupported platforms or permission errors.
 */
export function getAvailableDiskBytes(dir: string = homedir()): number | null {
  try {
    const stat = statfsSync(dir)
    return Number(stat.bavail) * Number(stat.bsize)
  } catch {
    return null
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '?'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(i === 0 ? 0 : 1)}${units[i]}`
}

/**
 * Rough estimate of disk footprint per Ollama model tag.
 * Used for pre-pull warnings only; Ollama will be authoritative at pull time.
 */
const MODEL_SIZE_HINTS: Record<string, number> = {
  // llama family
  'llama3.3:8b': 5e9,
  'llama4:scout': 65e9,
  'llama4:maverick': 230e9,
  // qwen
  'qwen2.5:7b': 4.7e9,
  'qwen2.5:14b': 9e9,
  'qwen2.5:32b': 20e9,
  'qwen3.5:9b': 5.5e9,
  'qwen3.5:27b': 17e9,
  // gemma
  'gemma2:2b': 1.6e9,
  'gemma2:9b': 5.4e9,
  'gemma3:1b': 0.8e9,
  'gemma3:4b': 2.5e9,
  'gemma3:12b': 7.5e9,
  'gemma3:27b': 17e9,
  'gemma3n': 2.8e9,
  // deepseek
  'deepseek-r1:7b': 4.7e9,
  'deepseek-r1:14b': 9e9,
  'deepseek-r1:32b': 20e9,
  // phi
  'phi4:14b': 9e9,
  // embedding
  'bge-m3': 1.2e9,
  'nomic-embed-text': 0.3e9,
  'mxbai-embed-large': 0.7e9,
}

export function estimateModelSize(tag: string): number | null {
  const lower = tag.toLowerCase()
  if (MODEL_SIZE_HINTS[lower]) return MODEL_SIZE_HINTS[lower]
  // Fuzzy match by prefix (e.g. "gemma3:27b-instruct-q4_0" → "gemma3:27b")
  for (const [k, v] of Object.entries(MODEL_SIZE_HINTS)) {
    if (lower.startsWith(k)) return v
  }
  return null
}

/**
 * Offer to install Ollama via the official install script. Returns true if the
 * platform is supported and install script exists. Never runs without the caller
 * confirming — this just resolves the install approach.
 */
export function getOllamaInstallCommand(): { supported: boolean; command?: string; url: string } {
  const p = platform()
  const url = 'https://ollama.com/download'
  if (p === 'darwin' || p === 'linux') {
    return { supported: true, command: 'curl -fsSL https://ollama.com/install.sh | sh', url }
  }
  return { supported: false, url }
}
