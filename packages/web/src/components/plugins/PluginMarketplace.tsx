import { useState } from 'react'
import { searchPlugins, installPlugin } from '../../lib/api'

interface NpmPackage {
  name: string
  description: string
  version: string
  [key: string]: unknown
}

export function PluginMarketplace() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NpmPackage[]>([])
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setMessage(null)
    setResults([])
    try {
      const data = await searchPlugins(query.trim())
      setResults(data.packages)
      if (data.packages.length === 0) {
        setMessage('No packages found.')
      }
    } catch {
      setMessage('Search failed. Check your network or npm registry connection.')
    } finally {
      setSearching(false)
    }
  }

  async function handleInstall(name: string) {
    setInstalling(name)
    setMessage(null)
    try {
      const data = await installPlugin(name)
      setMessage(`[ok] ${name}: ${data.message}`)
    } catch (err) {
      setMessage(`[!!] Failed to install ${name}: ${(err as Error).message}`)
    } finally {
      setInstalling(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search npm for opendocuments plugins..."
          className="flex-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {searching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.startsWith('[!!]') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
          {message}
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((pkg) => (
            <div
              key={pkg.name}
              className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3 gap-4"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-mono text-gray-900 dark:text-gray-100 truncate">{pkg.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{pkg.description || 'No description'}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">v{pkg.version}</p>
              </div>
              <button
                onClick={() => handleInstall(pkg.name)}
                disabled={installing === pkg.name}
                className="shrink-0 px-3 py-1.5 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-medium hover:bg-gray-700 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {installing === pkg.name ? 'Installing...' : 'Install'}
              </button>
            </div>
          ))}
        </div>
      )}

      {!searching && results.length === 0 && !message && (
        <p className="text-xs text-gray-400">
          Search npm for community plugins. Packages starting with <span className="font-mono">opendocuments-</span> or <span className="font-mono">@opendocuments/</span> can be installed directly.
        </p>
      )}
    </div>
  )
}
