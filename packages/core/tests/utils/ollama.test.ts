import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseModelName,
  isOllamaRunning,
  getOllamaModels,
  hasOllamaModel,
  pullOllamaModel,
  ensureOllamaModel,
} from '../../src/utils/ollama.js'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
    body: null,
  } as unknown as Response
}

function makeErrorResponse(): Response {
  return {
    ok: false,
    json: async () => ({}),
    body: null,
  } as unknown as Response
}

/* ------------------------------------------------------------------ */
/*  parseModelName                                                     */
/* ------------------------------------------------------------------ */

describe('parseModelName', () => {
  it('splits name and tag on colon', () => {
    expect(parseModelName('llama3:8b')).toEqual({ name: 'llama3', tag: '8b' })
  })

  it('defaults tag to latest when no colon is present', () => {
    expect(parseModelName('mistral')).toEqual({ name: 'mistral', tag: 'latest' })
  })

  it('handles multiple colons by splitting on the first', () => {
    // e.g. "registry.example.com:5000/model:tag" — splits on first ':'
    const result = parseModelName('some:complex:string')
    expect(result.name).toBe('some')
    expect(result.tag).toBe('complex:string')
  })

  it('handles empty tag after colon', () => {
    const result = parseModelName('model:')
    expect(result.name).toBe('model')
    expect(result.tag).toBe('')
  })
})

/* ------------------------------------------------------------------ */
/*  isOllamaRunning                                                    */
/* ------------------------------------------------------------------ */

describe('isOllamaRunning', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when /api/tags responds with ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse({ models: [] })))
    expect(await isOllamaRunning('http://localhost:11434')).toBe(true)
  })

  it('returns false when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorResponse()))
    expect(await isOllamaRunning('http://localhost:11434')).toBe(false)
  })

  it('returns false when fetch throws (server not reachable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    expect(await isOllamaRunning('http://localhost:11434')).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  getOllamaModels                                                    */
/* ------------------------------------------------------------------ */

describe('getOllamaModels', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns mapped model list on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse({
          models: [
            { name: 'llama3:8b', size: 1000, modified_at: '2024-01-01T00:00:00Z' },
            { name: 'mistral:latest', size: 2000, modified_at: '2024-02-01T00:00:00Z' },
          ],
        }),
      ),
    )

    const models = await getOllamaModels('http://localhost:11434')
    expect(models).toHaveLength(2)
    expect(models[0]).toEqual({ name: 'llama3:8b', size: 1000, modifiedAt: '2024-01-01T00:00:00Z' })
  })

  it('returns empty array on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorResponse()))
    expect(await getOllamaModels('http://localhost:11434')).toEqual([])
  })

  it('returns empty array when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    expect(await getOllamaModels('http://localhost:11434')).toEqual([])
  })

  it('returns empty array when models field is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkResponse({})))
    expect(await getOllamaModels('http://localhost:11434')).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/*  hasOllamaModel                                                     */
/* ------------------------------------------------------------------ */

describe('hasOllamaModel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when model with tag is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse({ models: [{ name: 'llama3:8b', size: 0, modified_at: '' }] }),
      ),
    )
    expect(await hasOllamaModel('http://localhost:11434', 'llama3:8b')).toBe(true)
  })

  it('returns true when model without tag matches by name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse({ models: [{ name: 'mistral', size: 0, modified_at: '' }] }),
      ),
    )
    expect(await hasOllamaModel('http://localhost:11434', 'mistral')).toBe(true)
  })

  it('returns false when model is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeOkResponse({ models: [{ name: 'llama3:8b', size: 0, modified_at: '' }] }),
      ),
    )
    expect(await hasOllamaModel('http://localhost:11434', 'mistral')).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  pullOllamaModel                                                    */
/* ------------------------------------------------------------------ */

describe('pullOllamaModel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true and calls onProgress for each NDJSON line', async () => {
    const ndjson = [
      JSON.stringify({ status: 'pulling manifest' }),
      JSON.stringify({ status: 'downloading', completed: 512, total: 1024 }),
      JSON.stringify({ status: 'success' }),
    ].join('\n')

    const encoder = new TextEncoder()
    const encoded = encoder.encode(ndjson)

    // Build a minimal ReadableStream
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded)
        controller.close()
      },
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, body: stream } as unknown as Response),
    )

    const progress: Array<{ status: string; completed?: number; total?: number }> = []
    const result = await pullOllamaModel('http://localhost:11434', 'llama3:8b', (status, completed, total) => {
      progress.push({ status, completed, total })
    })

    expect(result).toBe(true)
    expect(progress.length).toBeGreaterThanOrEqual(2)
    expect(progress[0].status).toBe('pulling manifest')
    expect(progress[1].completed).toBe(512)
    expect(progress[1].total).toBe(1024)
  })

  it('returns false on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeErrorResponse()))
    expect(await pullOllamaModel('http://localhost:11434', 'llama3:8b')).toBe(false)
  })

  it('returns false when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    expect(await pullOllamaModel('http://localhost:11434', 'llama3:8b')).toBe(false)
  })
})

/* ------------------------------------------------------------------ */
/*  ensureOllamaModel                                                  */
/* ------------------------------------------------------------------ */

describe('ensureOllamaModel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true without pulling when model already exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeOkResponse({ models: [{ name: 'llama3:8b', size: 0, modified_at: '' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await ensureOllamaModel('http://localhost:11434', 'llama3:8b')
    expect(result).toBe(true)
    // Only the tags check fetch should have been called (no pull)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('pulls the model when it is not present and returns true on success', async () => {
    const ndjson = JSON.stringify({ status: 'success' })
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(ndjson))
        controller.close()
      },
    })

    const fetchMock = vi
      .fn()
      // First call: tags check (model absent)
      .mockResolvedValueOnce(makeOkResponse({ models: [] }))
      // Second call: pull request
      .mockResolvedValueOnce({ ok: true, body: stream } as unknown as Response)

    vi.stubGlobal('fetch', fetchMock)

    const result = await ensureOllamaModel('http://localhost:11434', 'newmodel')
    expect(result).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
