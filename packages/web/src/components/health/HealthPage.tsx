import { useEffect, useMemo, useState } from 'react'
import { Activity, Gauge, Plug, RefreshCw, SearchCheck } from 'lucide-react'
import { getAdminStats, getConnectorStatus, getPluginHealth, getQueryLogs, getSearchQuality } from '../../lib/api'
import type {
  AdminStatsResponse,
  ConnectorStatusResponse,
  PluginHealthResponse,
  QueryLogsResponse,
  SearchQualityResponse,
} from '../../lib/types'
import { useAppStore } from '../../stores/appStore'
import { translate as tr, type Locale } from '../../lib/i18n'

type Tab = 'overview' | 'queries' | 'plugins' | 'connectors'

function pct(value?: number | null) {
  return `${Math.round((value || 0) * 100)}%`
}

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return tr(locale, 'common.notRecorded')
  return new Date(value).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US')
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[22px] font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-[12px] font-medium text-slate-500">{label}</p>
      {detail && <p className="mt-0.5 text-[11px] text-slate-400">{detail}</p>}
    </div>
  )
}

function Distribution({ values, emptyText }: { values: Record<string, number>; emptyText: string }) {
  const entries = Object.entries(values)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)

  if (entries.length === 0) {
    return <p className="text-[13px] text-slate-400">{emptyText}</p>
  }

  return (
    <div className="space-y-3">
      {entries.map(([name, count]) => {
        const percent = total > 0 ? Math.round((count / total) * 100) : 0
        return (
          <div key={name}>
            <div className="mb-1 flex justify-between gap-3 text-[13px]">
              <span className="truncate text-slate-700">{name}</span>
              <span className="shrink-0 text-slate-500">{count} · {percent}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100">
              <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function HealthPage() {
  const { locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<AdminStatsResponse | null>(null)
  const [quality, setQuality] = useState<SearchQualityResponse | null>(null)
  const [logs, setLogs] = useState<QueryLogsResponse | null>(null)
  const [plugins, setPlugins] = useState<PluginHealthResponse | null>(null)
  const [connectors, setConnectors] = useState<ConnectorStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      if (activeTab === 'overview') {
        const [nextStats, nextQuality] = await Promise.all([getAdminStats(), getSearchQuality()])
        setStats(nextStats)
        setQuality(nextQuality)
      } else if (activeTab === 'queries') {
        setLogs(await getQueryLogs({ limit: 50 }))
      } else if (activeTab === 'plugins') {
        setPlugins(await getPluginHealth())
      } else {
        setConnectors(await getConnectorStatus())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('activity.loading'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [activeTab])

  const queryRows = logs?.logs || []
  const averageConfidence = quality ? pct(quality.avgConfidence) : '-'
  const healthyPlugins = useMemo(() => plugins?.plugins.filter((plugin) => plugin.health.healthy).length || 0, [plugins])
  const activeConnectors = useMemo(() => connectors?.connectors.filter((connector) => connector.status === 'active').length || 0, [connectors])

  return (
    <div className="min-h-full bg-slate-50 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-blue-600">{t('activity.eyebrow')}</p>
            <h2 className="mt-1 text-[26px] font-semibold tracking-normal">{t('activity.title')}</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-500">
              {t('activity.subtitle')}
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={15} />
            {t('common.refresh')}
          </button>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {([
            ['overview', Activity],
            ['queries', SearchCheck],
            ['plugins', Gauge],
            ['connectors', Plug],
          ] as const).map(([tab, Icon]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex h-9 items-center gap-2 rounded-md px-3 text-[13px] font-medium capitalize ${
                activeTab === tab ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon size={15} />
              {t(`activity.${tab}`)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center text-[14px] text-slate-400 shadow-sm">
            {t('activity.loading')}
          </div>
        ) : activeTab === 'overview' && stats && quality ? (
          <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label={t('common.documents')} value={stats.documents} detail={`${stats.chunks} ${t('common.chunks')}`} />
              <Metric label={t('activity.queries')} value={quality.totalQueries} />
              <Metric label={t('dashboard.confidence')} value={averageConfidence} />
              <Metric label={t('activity.avgResponse')} value={`${quality.avgResponseTimeMs}ms`} />
            </section>

            <div className="grid gap-5 lg:grid-cols-3">
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-[15px] font-semibold text-slate-950">{t('activity.sourceDistribution')}</h3>
                <div className="mt-4"><Distribution values={stats.sourceDistribution} emptyText={t('dashboard.noIndexedData')} /></div>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-[15px] font-semibold text-slate-950">{t('activity.routeDistribution')}</h3>
                <div className="mt-4"><Distribution values={quality.routeDistribution} emptyText={t('dashboard.noIndexedData')} /></div>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-[15px] font-semibold text-slate-950">{t('activity.feedback')}</h3>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Metric label={t('activity.helpful')} value={quality.feedback.positive} />
                  <Metric label={t('activity.notUseful')} value={quality.feedback.negative} />
                </div>
              </section>
            </div>
          </div>
        ) : activeTab === 'queries' ? (
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3 text-[13px] text-slate-500">
              {t('activity.queryLogs', { count: logs?.total || 0 })}
            </div>
            {queryRows.length === 0 ? (
              <div className="px-5 py-12 text-center text-[14px] text-slate-400">{t('activity.noQueries')}</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {queryRows.map((log, index) => (
                  <div key={log.id || `${log.created_at}-${index}`} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <p className="min-w-0 text-[14px] font-semibold text-slate-900">{log.query}</p>
                      <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {log.route || 'unknown'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-400">
                      <span>{t('activity.intent')}: {log.intent || 'general'}</span>
                      <span>{t('activity.profile')}: {log.profile}</span>
                      <span>{t('dashboard.confidence')}: {log.confidence_score === null ? '-' : pct(log.confidence_score)}</span>
                      <span>{t('activity.response')}: {log.response_time_ms === null ? '-' : `${log.response_time_ms}ms`}</span>
                      <span>{formatDate(log.created_at, locale)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : activeTab === 'plugins' ? (
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3 text-[13px] text-slate-500">
              {t('activity.pluginsHealthy', { healthy: healthyPlugins, total: plugins?.plugins.length || 0 })}
            </div>
            <div className="divide-y divide-slate-100">
              {(plugins?.plugins || []).map((plugin) => (
                <div key={plugin.name} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-slate-900">{plugin.name}</p>
                    <p className="mt-1 text-[12px] text-slate-400">{plugin.type} · v{plugin.version} · {plugin.health.message || t('common.notRecorded')}</p>
                  </div>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${plugin.health.healthy ? 'bg-emerald-500' : 'bg-red-500'}`} />
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3 text-[13px] text-slate-500">
              {t('activity.connectorsActive', { active: activeConnectors, total: connectors?.connectors.length || 0 })}
            </div>
            {(connectors?.connectors || []).length === 0 ? (
              <div className="px-5 py-12 text-center text-[14px] text-slate-400">{t('activity.noConnectors')}</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {(connectors?.connectors || []).map((connector) => (
                  <div key={connector.connectorId} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-slate-900">{connector.name}</p>
                      <p className="mt-1 text-[12px] text-slate-400">
                        {connector.repo || connector.type} · {t('connections.lastSync', { value: formatDate(connector.lastSyncedAt, locale) })}
                      </p>
                    </div>
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                      connector.status === 'active'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}>
                      {connector.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
