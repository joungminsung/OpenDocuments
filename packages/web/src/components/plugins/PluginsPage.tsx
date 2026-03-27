import { useState, useEffect } from 'react'
import { getPluginHealth } from '../../lib/api'
import type { PluginHealthResponse } from '../../lib/types'

export function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginHealthResponse['plugins']>([])
  useEffect(() => {
    getPluginHealth().then(d => setPlugins(d.plugins)).catch(() => {})
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h2 className="text-xl font-semibold mb-4">Plugins</h2>
      <div className="space-y-2">
        {plugins.map(p => (
          <div key={p.name} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-mono">{p.name}</p>
              <p className="text-xs text-gray-400">{p.type} · v{p.version}</p>
            </div>
            <span className={`w-2.5 h-2.5 rounded-full ${p.health?.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-gray-400">Create plugins: opendocuments plugin create my-plugin --type parser</p>
    </div>
  )
}
