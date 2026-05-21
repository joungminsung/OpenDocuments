import { useState, useEffect } from 'react'
import { getDashboardData, getSearchQuality } from '../../lib/api.js'
import type {
  StatsResponse,
  AdminStatsResponse,
  ConnectorStatusResponse,
  PluginHealthResponse,
  SearchQualityResponse,
} from '../../lib/types'

interface DashboardData {
  stats: StatsResponse
  adminStats: AdminStatsResponse
  connectorStatus: ConnectorStatusResponse
  pluginHealth: PluginHealthResponse
}

interface StatCardProps {
  label: string
  value: string | number
  subtitle?: string
}

function StatCard({ label, value, subtitle }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{value}</p>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">{label}</p>
      {subtitle && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>
      )}
    </div>
  )
}

export function UnifiedDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [quality, setQuality] = useState<SearchQualityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([getDashboardData(), getSearchQuality()])
      .then(([dashboardData, qualityData]) => {
        setData(dashboardData)
        setQuality(qualityData)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading dashboard...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Dashboard</h2>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-600 dark:text-red-400">Error loading dashboard: {error}</p>
        </div>
      </div>
    )
  }

  if (!data) return <></>

  const { adminStats, connectorStatus, pluginHealth } = data
  const avgConfidencePct = quality ? (quality.avgConfidence * 100).toFixed(0) + '%' : '-'

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Dashboard</h2>

      {/* Overview Cards */}
      <section>
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Documents" value={adminStats.documents} subtitle={`${adminStats.chunks} chunks`} />
          <StatCard label="Workspaces" value={adminStats.workspaces} />
          <StatCard label="Plugins" value={adminStats.plugins} />
          <StatCard label="Avg Confidence" value={avgConfidencePct} subtitle={quality ? `${quality.totalQueries} queries` : undefined} />
        </div>
      </section>

      {/* Source Distribution */}
      {adminStats.sourceDistribution && Object.keys(adminStats.sourceDistribution).length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">Source Distribution</h3>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="space-y-3">
              {Object.entries(adminStats.sourceDistribution).map(([source, count]) => {
                const total = Object.values(adminStats.sourceDistribution).reduce((a, b) => a + b, 0)
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={source}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300 capitalize">{source}</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className="bg-primary-500 h-1.5 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Connectors Status */}
      <section>
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">Connectors</h3>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {connectorStatus.connectors.length === 0 ? (
            <p className="text-sm text-gray-400 p-4">No connectors registered</p>
          ) : (
            connectorStatus.connectors.map((connector) => (
              <div key={connector.connectorId} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    connector.status === 'active' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{connector.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Last sync: {connector.lastSyncedAt
                        ? new Date(connector.lastSyncedAt).toLocaleString()
                        : 'never'}
                    </p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  connector.status === 'active'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}>
                  {connector.status}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Search Quality Metrics */}
      {quality && (
        <section>
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">Search Quality</h3>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{quality.totalQueries}</p>
                <p className="text-xs text-gray-400 mt-0.5">Total Queries</p>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{quality.avgResponseTimeMs}ms</p>
                <p className="text-xs text-gray-400 mt-0.5">Avg Response Time</p>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{avgConfidencePct}</p>
                <p className="text-xs text-gray-400 mt-0.5">Avg Confidence</p>
              </div>
              <div>
                <div className="flex gap-3 text-sm">
                  <span className="text-green-600 dark:text-green-400 font-semibold">+{quality.feedback.positive}</span>
                  <span className="text-red-500 dark:text-red-400 font-semibold">-{quality.feedback.negative}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">Feedback</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Plugin Health */}
      <section>
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">Plugin Health</h3>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {pluginHealth.plugins.length === 0 ? (
            <p className="text-sm text-gray-400 p-4">No plugins installed</p>
          ) : (
            pluginHealth.plugins.map((plugin) => (
              <div key={plugin.name} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-mono text-gray-800 dark:text-gray-200">{plugin.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{plugin.type} &middot; v{plugin.version}</p>
                </div>
                <div className="flex items-center gap-2">
                  {plugin.health.message && !plugin.health.healthy && (
                    <span className="text-xs text-red-500 dark:text-red-400 max-w-[180px] truncate">{plugin.health.message}</span>
                  )}
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${plugin.health.healthy ? 'bg-green-500' : 'bg-red-500'}`} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
