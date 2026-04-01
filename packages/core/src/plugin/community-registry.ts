import { fetchWithTimeout } from '../utils/fetch.js'

const REGISTRY_URL =
  'https://raw.githubusercontent.com/joungminsung/OpenDocuments/main/community-plugins.json'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/**
 * A community-contributed plugin listed in the GitHub-hosted registry.
 */
export interface CommunityPlugin {
  name: string
  description: string
  type: 'model' | 'parser' | 'connector' | 'middleware'
  version: string
  repository: string
  verified: boolean
  coreCompatibility: string
}

let cache: { plugins: CommunityPlugin[]; fetchedAt: number } | null = null

/**
 * Fetch the community plugin listing from GitHub.
 * Results are cached for 1 hour. Returns the stale cache (or `[]`) on failure.
 */
export async function fetchCommunityPlugins(): Promise<CommunityPlugin[]> {
  const now = Date.now()

  if (cache !== null && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.plugins
  }

  try {
    const response = await fetchWithTimeout(REGISTRY_URL, {}, 10000)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data: unknown = await response.json()

    if (!Array.isArray(data)) {
      throw new Error('Community plugin registry is not an array')
    }

    const plugins = data.filter(isValidCommunityPlugin)
    cache = { plugins, fetchedAt: now }
    return plugins
  } catch {
    return cache !== null ? cache.plugins : []
  }
}

/**
 * Filter community plugins by an optional text query and/or type.
 *
 * @param plugins - The list of plugins to filter (e.g. from `fetchCommunityPlugins`)
 * @param query   - Case-insensitive substring match against name and description
 * @param type    - Exact match against the plugin type
 */
export function filterCommunityPlugins(
  plugins: CommunityPlugin[],
  query?: string,
  type?: CommunityPlugin['type']
): CommunityPlugin[] {
  let result = plugins

  if (type !== undefined) {
    result = result.filter((p) => p.type === type)
  }

  if (query !== undefined && query.length > 0) {
    const lower = query.toLowerCase()
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.description.toLowerCase().includes(lower)
    )
  }

  return result
}

function isValidCommunityPlugin(value: unknown): value is CommunityPlugin {
  if (typeof value !== 'object' || value === null) return false

  const p = value as Record<string, unknown>

  return (
    typeof p['name'] === 'string' &&
    typeof p['description'] === 'string' &&
    (p['type'] === 'model' ||
      p['type'] === 'parser' ||
      p['type'] === 'connector' ||
      p['type'] === 'middleware') &&
    typeof p['version'] === 'string' &&
    typeof p['repository'] === 'string' &&
    typeof p['verified'] === 'boolean' &&
    typeof p['coreCompatibility'] === 'string'
  )
}
