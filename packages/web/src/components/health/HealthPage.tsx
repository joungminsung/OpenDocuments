import { useState, useEffect } from 'react'
import { getAdminStats, getSearchQuality, getQueryLogs, getPluginHealth, getConnectorStatus } from '../../lib/api'
import type { AdminStatsResponse, SearchQualityResponse, QueryLogsResponse, PluginHealthResponse, ConnectorStatusResponse } from '../../lib/types'

export function HealthPage() {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null)
  const [quality, setQuality] = useState<SearchQualityResponse | null>(null)
  const [logs, setLogs] = useState<QueryLogsResponse | null>(null)
  const [plugins, setPlugins] = useState<PluginHealthResponse | null>(null)
  const [connectors, setConnectors] = useState<ConnectorStatusResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'queries' | 'plugins' | 'connectors'>('overview')

  useEffect(() => {
    setLoading(true)
    if (activeTab === 'overview') {
      Promise.all([getAdminStats(), getSearchQuality()])
        .then(([s, q]) => { setStats(s); setQuality(q) })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    } else if (activeTab === 'queries') {
      getQueryLogs({ limit: 20 })
        .then(setLogs)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    } else if (activeTab === 'plugins') {
      getPluginHealth()
        .then(setPlugins)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    } else if (activeTab === 'connectors') {
      getConnectorStatus()
        .then(setConnectors)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [activeTab])

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h2 className="text-xl font-semibold mb-4">Admin Dashboard</h2>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-600 dark:text-red-400">Error: {error}</p>
        </div>
      </div>
    )
  }

  if (loading) return <div className="p-8 text-gray-400">Loading dashboard...</div>

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h2 className="text-xl font-semibold mb-6">Admin Dashboard</h2>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-800">
        {(['overview', 'queries', 'plugins', 'connectors'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Documents', value: stats.documents },
              { label: 'Chunks', value: stats.chunks },
              { label: 'Workspaces', value: stats.workspaces },
              { label: 'Plugins', value: stats.plugins },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                <p className="text-2xl font-bold text-primary-600">{value}</p>
                <p className="text-xs text-gray-400 mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* Quality Metrics */}
          {quality && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">Search Quality</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-lg font-semibold">{quality.totalQueries}</p>
                  <p className="text-xs text-gray-400">Total Queries</p>
                </div>
                <div>
                  <p className="text-lg font-semibold">{(quality.avgConfidence * 100).toFixed(0)}%</p>
                  <p className="text-xs text-gray-400">Avg Confidence</p>
                </div>
                <div>
                  <p className="text-lg font-semibold">{quality.avgResponseTimeMs}ms</p>
                  <p className="text-xs text-gray-400">Avg Response</p>
                </div>
              </div>
              {quality.feedback && (
                <div className="mt-3 flex gap-4 text-sm">
                  <span className="text-green-500">+{quality.feedback.positive}</span>
                  <span className="text-red-500">-{quality.feedback.negative}</span>
                </div>
              )}
            </div>
          )}

          {/* Distributions */}
          {stats.sourceDistribution && Object.keys(stats.sourceDistribution).length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">Source Distribution</h3>
              <div className="space-y-2">
                {Object.entries(stats.sourceDistribution).map(([source, count]) => (
                  <div key={source} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">{source}</span>
                    <span className="font-medium">{count as number}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Queries Tab */}
      {activeTab === 'queries' && logs && (
        <div className="space-y-4">
          <div className="text-sm text-gray-400">{logs.total} total queries</div>
          <div className="space-y-2">
            {(logs.logs || []).map((log: any, i: number) => (
              <div key={i} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3">
                <div className="flex justify-between items-start">
                  <p className="text-sm font-medium truncate flex-1">{log.query}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${
                    log.route === 'rag' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {log.route || 'unknown'}
                  </span>
                </div>
                <div className="flex gap-4 mt-1 text-xs text-gray-400">
                  <span>Intent: {log.intent || 'general'}</span>
                  <span>Confidence: {log.confidence_score ? (log.confidence_score * 100).toFixed(0) + '%' : '-'}</span>
                  <span>{log.response_time_ms ? log.response_time_ms + 'ms' : ''}</span>
                  <span className="ml-auto">{log.created_at ? new Date(log.created_at).toLocaleString() : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plugins Tab */}
      {activeTab === 'plugins' && plugins && (
        <div className="space-y-2">
          {(plugins.plugins || []).map((p: any) => (
            <div key={p.name} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-mono">{p.name}</p>
                <p className="text-xs text-gray-400">{p.type} · v{p.version}</p>
              </div>
              <span className={`w-2.5 h-2.5 rounded-full ${p.health?.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
          ))}
        </div>
      )}

      {/* Connectors Tab */}
      {activeTab === 'connectors' && connectors && (
        <div className="space-y-2">
          {(connectors.connectors || []).length === 0 ? (
            <p className="text-sm text-gray-400">No connectors registered</p>
          ) : (
            connectors.connectors.map((c: any) => (
              <div key={c.connectorId} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-gray-400">Last sync: {c.lastSyncedAt || 'never'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  c.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600'
                }`}>
                  {c.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
