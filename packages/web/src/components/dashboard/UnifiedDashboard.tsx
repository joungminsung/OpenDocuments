import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Database, FileText, Plug, RefreshCw, SearchCheck } from 'lucide-react'
import { getAdminStats, getConnectorStatus, getPluginHealth, getSearchQuality, getWorkbench } from '../../lib/api'
import type { AdminStatsResponse, ConnectorStatusResponse, PluginHealthResponse, SearchQualityResponse, WorkbenchResponse } from '../../lib/types'
import { useAppStore } from '../../stores/appStore'
import { translate as tr, type Locale } from '../../lib/i18n'

interface DashboardData {
  workbench: WorkbenchResponse
  stats: AdminStatsResponse
  quality: SearchQualityResponse
  connectors: ConnectorStatusResponse
  plugins: PluginHealthResponse
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return tr(locale, 'common.never')
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

function ReadinessItem({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-3">
      {ok ? <CheckCircle2 size={17} className="mt-0.5 text-emerald-500" /> : <AlertTriangle size={17} className="mt-0.5 text-amber-500" />}
      <div>
        <p className="text-[13px] font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-[12px] leading-4 text-slate-500">{detail}</p>
      </div>
    </div>
  )
}

export function UnifiedDashboard() {
  const { locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const [workbench, stats, quality, connectors, plugins] = await Promise.all([
        getWorkbench(),
        getAdminStats(),
        getSearchQuality(),
        getConnectorStatus(),
        getPluginHealth(),
      ])
      setData({ workbench, stats, quality, connectors, plugins })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dashboard.unavailable'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const readiness = useMemo(() => {
    if (!data) return []
    const healthyPlugins = data.plugins.plugins.filter((plugin) => plugin.health.healthy).length
    const activeConnectors = data.connectors.connectors.filter((connector) => connector.status === 'active').length
    return [
      {
        ok: data.workbench.corpus.documents > 0 && data.workbench.corpus.chunks > 0,
        title: t('dashboard.corpusIndexed'),
        detail: t('dashboard.corpusIndexedDetail', { documents: data.workbench.corpus.documents, chunks: data.workbench.corpus.chunks }),
      },
      {
        ok: data.workbench.health.modelStatus === 'ready',
        title: t('dashboard.modelReady'),
        detail: data.workbench.health.modelStatus === 'ready'
          ? t('dashboard.modelReadyDetail', { models: data.workbench.health.models })
          : t('dashboard.modelDegradedDetail'),
      },
      {
        ok: data.connectors.connectors.length === 0 || activeConnectors > 0,
        title: t('dashboard.connectorsOperational'),
        detail: t('dashboard.connectorsOperationalDetail', { active: activeConnectors, total: data.connectors.connectors.length }),
      },
      {
        ok: data.plugins.plugins.length === 0 || healthyPlugins === data.plugins.plugins.length,
        title: t('dashboard.pluginHealthClean'),
        detail: t('dashboard.pluginHealthDetail', { healthy: healthyPlugins, total: data.plugins.plugins.length }),
      },
    ]
  }, [data, locale])

  if (loading) {
    return <div className="flex h-full items-center justify-center p-8 text-[14px] text-slate-400">{t('dashboard.loading')}</div>
  }

  if (error || !data) {
    return (
      <div className="min-h-full bg-slate-50 px-6 py-6">
        <div className="mx-auto max-w-4xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || t('dashboard.unavailable')}
        </div>
      </div>
    )
  }

  const { workbench, stats, quality, connectors, plugins } = data
  const activeConnectors = connectors.connectors.filter((connector) => connector.status === 'active').length
  const healthyPlugins = plugins.plugins.filter((plugin) => plugin.health.healthy).length

  return (
    <div className="min-h-full bg-slate-50 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-blue-600">{t('dashboard.eyebrow')}</p>
            <h2 className="mt-1 text-[26px] font-semibold tracking-normal">{t('dashboard.title')}</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-500">
              {t('dashboard.subtitle')}
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

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label={t('common.documents')} value={stats.documents} detail={`${stats.chunks} ${t('common.chunks')}`} />
          <Metric label={t('dashboard.queries')} value={quality.totalQueries} detail={`${quality.avgResponseTimeMs}ms ${t('activity.avgResponse')}`} />
          <Metric label={t('dashboard.confidence')} value={pct(quality.avgConfidence)} detail={`${quality.feedback.positive} ${t('activity.helpful')}`} />
          <Metric label={t('dashboard.connectors')} value={`${activeConnectors}/${connectors.connectors.length}`} detail={t('common.active')} />
          <Metric label={t('dashboard.plugins')} value={`${healthyPlugins}/${plugins.plugins.length}`} detail={t('common.healthy')} />
        </section>

        <section className="grid gap-3 lg:grid-cols-4">
          {readiness.map((item) => (
            <ReadinessItem key={item.title} ok={item.ok} title={item.title} detail={item.detail} />
          ))}
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Database size={17} className="text-slate-500" />
              <h3 className="text-[15px] font-semibold text-slate-950">{t('dashboard.corpusComposition')}</h3>
            </div>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div>
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-slate-400">{t('dashboard.sourceTypes')}</p>
                <Distribution values={stats.sourceDistribution} emptyText={t('dashboard.noIndexedData')} />
              </div>
              <div>
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-slate-400">{t('dashboard.indexStatus')}</p>
                <Distribution values={stats.statusDistribution} emptyText={t('dashboard.noIndexedData')} />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <SearchCheck size={17} className="text-slate-500" />
              <h3 className="text-[15px] font-semibold text-slate-950">{t('dashboard.recentQuestions')}</h3>
            </div>
            {workbench.recentQueries.length === 0 ? (
              <p className="mt-4 text-[13px] text-slate-400">{t('dashboard.noRecentQuestions')}</p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {workbench.recentQueries.map((query, index) => (
                  <div key={`${query.createdAt}-${index}`} className="py-3 first:pt-0 last:pb-0">
                    <p className="line-clamp-2 text-[13px] font-semibold text-slate-900">{query.query}</p>
                    <p className="mt-1 text-[12px] text-slate-400">
                      {query.route || t('common.unknown')} · {query.confidenceScore === null ? '-' : pct(query.confidenceScore)} · {formatDate(query.createdAt, locale)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Plug size={17} className="text-slate-500" />
              <h3 className="text-[15px] font-semibold text-slate-950">{t('dashboard.connectorSyncState')}</h3>
            </div>
            {connectors.connectors.length === 0 ? (
              <p className="mt-4 text-[13px] text-slate-400">{t('dashboard.noConnectors')}</p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {connectors.connectors.map((connector) => (
                  <div key={connector.connectorId} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-slate-900">{connector.name}</p>
                      <p className="mt-1 truncate text-[12px] text-slate-400">{connector.repo || connector.type} · {formatDate(connector.lastSyncedAt, locale)}</p>
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

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <FileText size={17} className="text-slate-500" />
              <h3 className="text-[15px] font-semibold text-slate-950">{t('dashboard.topPluginIssues')}</h3>
            </div>
            {plugins.plugins.filter((plugin) => !plugin.health.healthy).length === 0 ? (
              <p className="mt-4 text-[13px] text-slate-400">{t('dashboard.noPluginIssues')}</p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {plugins.plugins.filter((plugin) => !plugin.health.healthy).slice(0, 6).map((plugin) => (
                  <div key={plugin.name} className="py-3 first:pt-0 last:pb-0">
                    <p className="truncate text-[13px] font-semibold text-slate-900">{plugin.name}</p>
                    <p className="mt-1 text-[12px] text-red-500">{plugin.health.message || t('common.unhealthy')}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
