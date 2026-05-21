import { fetchWithTimeout } from 'opendocuments-core'

/** Information about the current vs latest available version. */
export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  checkedAt: string
}

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/opendocuments/latest'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

let cachedUpdateInfo: UpdateInfo | null = null
let cacheTimestamp = 0

/**
 * Returns the most recently cached UpdateInfo, or null if no check has been
 * performed yet (or the module was just loaded).
 */
export function getCachedUpdateInfo(): UpdateInfo | null {
  return cachedUpdateInfo
}

/**
 * Compares two semver strings.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 * Only handles simple MAJOR.MINOR.PATCH without pre-release tags.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string): [number, number, number] => {
    const parts = v.replace(/^v/, '').split('.').map(Number)
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
  }

  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)

  if (aMaj !== bMaj) return aMaj < bMaj ? -1 : 1
  if (aMin !== bMin) return aMin < bMin ? -1 : 1
  if (aPat !== bPat) return aPat < bPat ? -1 : 1
  return 0
}

/**
 * Checks npm registry for the latest version of the `opendocuments` package.
 * Results are cached for 24 hours.  On any fetch or parse failure the function
 * returns a safe default with `updateAvailable: false` — it never throws.
 */
export async function checkForUpdates(currentVersion: string): Promise<UpdateInfo> {
  const now = Date.now()

  // Return cached result if still fresh
  if (cachedUpdateInfo !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedUpdateInfo
  }

  try {
    const response = await fetchWithTimeout(NPM_REGISTRY_URL, {}, 5000)

    if (!response.ok) {
      return buildFallback(currentVersion)
    }

    const data = await response.json() as { version?: unknown }
    const latestVersion = typeof data.version === 'string' ? data.version : null

    if (latestVersion === null) {
      return buildFallback(currentVersion)
    }

    const updateAvailable = compareVersions(currentVersion, latestVersion) === -1

    const info: UpdateInfo = {
      currentVersion,
      latestVersion,
      updateAvailable,
      checkedAt: new Date(now).toISOString(),
    }

    cachedUpdateInfo = info
    cacheTimestamp = now
    return info
  } catch {
    return buildFallback(currentVersion)
  }
}

function buildFallback(currentVersion: string): UpdateInfo {
  return {
    currentVersion,
    latestVersion: currentVersion,
    updateAvailable: false,
    checkedAt: new Date().toISOString(),
  }
}
