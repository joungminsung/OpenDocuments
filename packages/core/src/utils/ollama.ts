import { fetchWithTimeout } from './fetch.js'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OllamaModel {
  name: string
  size: number
  modifiedAt: string
}

/* ------------------------------------------------------------------ */
/*  parseModelName                                                     */
/* ------------------------------------------------------------------ */

/**
 * Splits a model string on `:` and returns the name and tag parts.
 * Defaults the tag to `'latest'` when no tag is present.
 */
export function parseModelName(model: string): { name: string; tag: string } {
  const idx = model.indexOf(':')
  if (idx === -1) {
    return { name: model, tag: 'latest' }
  }
  return { name: model.slice(0, idx), tag: model.slice(idx + 1) }
}

/* ------------------------------------------------------------------ */
/*  isOllamaRunning                                                    */
/* ------------------------------------------------------------------ */

/**
 * Returns `true` when the Ollama server at `baseUrl` is reachable.
 * Uses a 5-second timeout via `fetchWithTimeout`.
 */
export async function isOllamaRunning(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/tags`, {}, 5000)
    return res.ok
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  getOllamaModels                                                    */
/* ------------------------------------------------------------------ */

/**
 * Returns the list of locally available Ollama models.
 * Returns an empty array on any failure.
 */
export async function getOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/tags`, {}, 5000)
    if (!res.ok) return []
    const data = (await res.json()) as { models?: Array<{ name: string; size: number; modified_at: string }> }
    if (!Array.isArray(data.models)) return []
    return data.models.map((m) => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
    }))
  } catch {
    return []
  }
}

/* ------------------------------------------------------------------ */
/*  hasOllamaModel                                                     */
/* ------------------------------------------------------------------ */

/**
 * Returns `true` when `modelName` is present in the local Ollama model list.
 */
export async function hasOllamaModel(baseUrl: string, modelName: string): Promise<boolean> {
  const models = await getOllamaModels(baseUrl)
  const { name, tag } = parseModelName(modelName)
  const target = tag === 'latest' ? name : `${name}:${tag}`
  return models.some((m) => {
    // Normalise: if stored name has no tag, treat it as :latest
    const { name: storedName, tag: storedTag } = parseModelName(m.name)
    const stored = storedTag === 'latest' ? storedName : `${storedName}:${storedTag}`
    return stored === target || storedName === name
  })
}

/* ------------------------------------------------------------------ */
/*  pullOllamaModel                                                    */
/* ------------------------------------------------------------------ */

/**
 * Pulls `modelName` from the Ollama registry.
 *
 * The pull response is a stream of NDJSON objects with the shape:
 * `{ status: string; completed?: number; total?: number }`.
 *
 * `onProgress` is called for each status line received.
 *
 * Returns `true` when the pull succeeds, `false` on error.
 */
export async function pullOllamaModel(
  baseUrl: string,
  modelName: string,
  onProgress?: (status: string, completed?: number, total?: number) => void,
): Promise<boolean> {
  try {
    // Use regular fetch (no timeout) — pulls can take minutes.
    const res = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName, stream: true }),
    })

    if (!res.ok || !res.body) return false

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep last (possibly incomplete) line in the buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const parsed = JSON.parse(trimmed) as { status?: string; completed?: number; total?: number }
          if (onProgress && parsed.status) {
            onProgress(parsed.status, parsed.completed, parsed.total)
          }
        } catch {
          // Ignore malformed lines
        }
      }
    }

    // Process any remaining buffered content
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim()) as { status?: string; completed?: number; total?: number }
        if (onProgress && parsed.status) {
          onProgress(parsed.status, parsed.completed, parsed.total)
        }
      } catch {
        // Ignore
      }
    }

    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  ensureOllamaModel                                                  */
/* ------------------------------------------------------------------ */

/**
 * Checks whether `modelName` is already available locally; if not, pulls it.
 * Returns `true` when the model is available (or successfully pulled).
 */
export async function ensureOllamaModel(
  baseUrl: string,
  modelName: string,
  onProgress?: (status: string, completed?: number, total?: number) => void,
): Promise<boolean> {
  const already = await hasOllamaModel(baseUrl, modelName)
  if (already) return true
  return pullOllamaModel(baseUrl, modelName, onProgress)
}
