import { useEffect, useMemo, useState } from 'react'
import { Package, RefreshCw, Search, Trash2 } from 'lucide-react'
import { getPluginHealth, removePlugin } from '../../lib/api'
import type { PluginHealthResponse } from '../../lib/types'
import { PluginMarketplace } from './PluginMarketplace'
import { useAppStore } from '../../stores/appStore'
import { translate as tr } from '../../lib/i18n'

type Tab = 'installed' | 'marketplace'
type HealthFilter = 'all' | 'healthy' | 'unhealthy'

function healthTone(healthy: boolean) {
  return healthy
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-red-200 bg-red-50 text-red-700'
}

export function PluginsPage() {
  const { locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [activeTab, setActiveTab] = useState<Tab>('installed')
  const [plugins, setPlugins] = useState<PluginHealthResponse['plugins']>([])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all')
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getPluginHealth()
      setPlugins(data.plugins)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('plugins.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const pluginTypes = useMemo(() => Array.from(new Set(plugins.map((plugin) => plugin.type))).sort(), [plugins])
  const filteredPlugins = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return plugins.filter((plugin) => {
      const matchesQuery = !normalized
        || plugin.name.toLowerCase().includes(normalized)
        || plugin.type.toLowerCase().includes(normalized)
        || plugin.version.toLowerCase().includes(normalized)
      const matchesType = typeFilter === 'all' || plugin.type === typeFilter
      const matchesHealth = healthFilter === 'all'
        || (healthFilter === 'healthy' && plugin.health.healthy)
        || (healthFilter === 'unhealthy' && !plugin.health.healthy)
      return matchesQuery && matchesType && matchesHealth
    })
  }, [healthFilter, plugins, query, typeFilter])

  const healthyCount = plugins.filter((plugin) => plugin.health.healthy).length

  const handleRemove = async (name: string) => {
    if (!confirm(t('plugins.removeConfirm', { name }))) return
    setRemoving(name)
    setError(null)
    setMessage(null)
    try {
      await removePlugin(name)
      setMessage(t('plugins.removed', { name }))
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('plugins.removeError'))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="min-h-full bg-slate-50 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-blue-600">{t('plugins.eyebrow')}</p>
            <h2 className="mt-1 text-[26px] font-semibold tracking-normal">{t('plugins.title')}</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-500">
              {t('plugins.subtitle')}
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

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {(['installed', 'marketplace'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-9 rounded-md px-3 text-[13px] font-medium capitalize ${
                activeTab === tab ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {t(`plugins.${tab}`)}
            </button>
          ))}
        </div>

        {activeTab === 'marketplace' ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <PluginMarketplace onInstalled={() => void refresh()} />
          </section>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[22px] font-semibold">{plugins.length}</p>
                <p className="mt-1 text-[12px] font-medium text-slate-500">{t('plugins.installed')}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[22px] font-semibold">{healthyCount}</p>
                <p className="mt-1 text-[12px] font-medium text-slate-500">{t('common.healthy')}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[22px] font-semibold">{pluginTypes.length}</p>
                <p className="mt-1 text-[12px] font-medium text-slate-500">{t('plugins.pluginTypes')}</p>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="grid gap-3 border-b border-slate-200 px-4 py-4 lg:grid-cols-[1fr_180px_160px]">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('plugins.searchPlaceholder')}
                    className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-[14px] outline-none focus:border-blue-300"
                  />
                </div>
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-blue-300"
                >
                  <option value="all">{t('plugins.allTypes')}</option>
                  {pluginTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <select
                  value={healthFilter}
                  onChange={(event) => setHealthFilter(event.target.value as HealthFilter)}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-blue-300"
                >
                  <option value="all">{t('plugins.allHealth')}</option>
                  <option value="healthy">{t('common.healthy')}</option>
                  <option value="unhealthy">{t('common.unhealthy')}</option>
                </select>
              </div>

              {loading ? (
                <div className="px-5 py-12 text-center text-[14px] text-slate-400">{t('plugins.loading')}</div>
              ) : filteredPlugins.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Package size={28} className="mx-auto text-slate-300" />
                  <p className="mt-3 text-[14px] font-medium text-slate-700">{t('plugins.empty')}</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredPlugins.map((plugin) => (
                    <div key={plugin.name} className="grid gap-3 px-4 py-4 lg:grid-cols-[1fr_130px_130px_80px] lg:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[13px] font-semibold text-slate-900">{plugin.name}</p>
                        <p className="mt-1 text-[12px] text-slate-400">{plugin.health.message || t('common.notRecorded')}</p>
                      </div>
                      <span className="text-[13px] text-slate-600">{plugin.type}</span>
                      <span className={`w-fit rounded-md border px-2 py-0.5 text-[11px] font-medium ${healthTone(plugin.health.healthy)}`}>
                        {plugin.health.healthy ? t('common.healthy') : t('common.unhealthy')}
                      </span>
                      <div className="flex items-center justify-between gap-2 lg:justify-end">
                        <span className="text-[12px] text-slate-400">v{plugin.version}</span>
                        <button
                          onClick={() => void handleRemove(plugin.name)}
                          disabled={removing === plugin.name}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          aria-label={`${t('common.remove')} ${plugin.name}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
