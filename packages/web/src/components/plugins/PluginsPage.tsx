import { useState, useEffect } from 'react'
import { getPluginHealth } from '../../lib/api'
import type { PluginHealthResponse } from '../../lib/types'
import { PluginMarketplace } from './PluginMarketplace'

type Tab = 'installed' | 'marketplace'

export function PluginsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('installed')
  const [plugins, setPlugins] = useState<PluginHealthResponse['plugins']>([])

  useEffect(() => {
    getPluginHealth().then(d => setPlugins(d.plugins)).catch(() => {})
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h2 className="text-xl font-semibold mb-4">Plugins</h2>

      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('installed')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'installed'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Installed
        </button>
        <button
          onClick={() => setActiveTab('marketplace')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'marketplace'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Marketplace
        </button>
      </div>

      {activeTab === 'installed' && (
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
          {plugins.length === 0 && (
            <p className="text-sm text-gray-400">No plugins installed.</p>
          )}
          <p className="mt-4 text-xs text-gray-400">Create plugins: opendocuments plugin create my-plugin --type parser</p>
        </div>
      )}

      {activeTab === 'marketplace' && <PluginMarketplace />}
    </div>
  )
}
