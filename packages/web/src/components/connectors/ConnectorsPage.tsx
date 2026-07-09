import { useEffect, useMemo, useState } from 'react'
import { GitBranch, Plug, RefreshCw, RotateCw } from 'lucide-react'
import { connectGitHubConnector, getConnectorStatus, syncGitHubConnector } from '../../lib/api'
import type { ConnectorStatusResponse } from '../../lib/types'
import { useAppStore } from '../../stores/appStore'
import { translate as tr, type Locale } from '../../lib/i18n'

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return tr(locale, 'common.never')
  return new Date(value).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US')
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'active'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-slate-200 bg-slate-50 text-slate-600'
  return <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone}`}>{status}</span>
}

export function ConnectorsPage() {
  const { locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [connectors, setConnectors] = useState<ConnectorStatusResponse['connectors']>([])
  const [repo, setRepo] = useState('')
  const [branch, setBranch] = useState('main')
  const [token, setToken] = useState('')
  const [paths, setPaths] = useState('')
  const [syncInterval, setSyncInterval] = useState('300')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'connect' | 'sync' | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await getConnectorStatus()
      setConnectors(data.connectors)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const githubConnector = useMemo(() => {
    return connectors.find((connector) => connector.name === 'github' || connector.type === '@opendocuments/connector-github') || null
  }, [connectors])
  const activeCount = connectors.filter((connector) => connector.status === 'active').length

  const handleConnect = async () => {
    setBusy('connect')
    setMessage(null)
    try {
      const normalizedPaths = paths.split('\n').map((path) => path.trim()).filter(Boolean)
      const interval = Number(syncInterval)
      const result = await connectGitHubConnector({
        repo: repo.trim(),
        branch: branch.trim() || 'main',
        token: token.trim() || undefined,
        paths: normalizedPaths.length > 0 ? normalizedPaths : undefined,
        syncInterval: Number.isFinite(interval) ? interval : 300,
      })
      await refresh()
      setToken('')
      setMessage({ type: 'ok', text: t('connections.connectedMessage', { repo: result.connector.repo || repo.trim() }) })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('connections.errorConnect') })
    } finally {
      setBusy(null)
    }
  }

  const handleSync = async () => {
    setBusy('sync')
    setMessage(null)
    try {
      const result = await syncGitHubConnector()
      await refresh()
      const { documentsDiscovered, documentsIndexed, documentsSkipped, errors } = result.result
      setMessage({
        type: errors.length > 0 ? 'error' : 'ok',
        text: t('connections.syncFinished', {
          found: documentsDiscovered,
          indexed: documentsIndexed,
          skipped: documentsSkipped,
          errors: errors.length > 0 ? `, ${errors.length} ${t('documents.errors')}` : '',
        }),
      })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('connections.errorSync') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-full bg-slate-50 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-blue-600">{t('connections.eyebrow')}</p>
            <h2 className="mt-1 text-[26px] font-semibold tracking-normal">{t('connections.title')}</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-500">
              {t('connections.subtitle')}
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

        {message && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[22px] font-semibold">{connectors.length}</p>
            <p className="mt-1 text-[12px] font-medium text-slate-500">{t('connections.registered')}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[22px] font-semibold">{activeCount}</p>
            <p className="mt-1 text-[12px] font-medium text-slate-500">{t('common.active')}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-[22px] font-semibold">{githubConnector ? t('common.active') : t('connections.notSet')}</p>
            <p className="mt-1 text-[12px] font-medium text-slate-500">{t('connections.github')}</p>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <GitBranch size={20} className="text-slate-700" />
                  <div>
                    <h3 className="text-[16px] font-semibold">{t('connections.githubRepo')}</h3>
                    <p className="mt-1 text-[13px] text-slate-500">{t('connections.githubHelp')}</p>
                  </div>
                </div>
                <StatusBadge status={githubConnector ? githubConnector.status : t('connections.notConnected')} />
              </div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label>
                <span className="text-[12px] font-semibold text-slate-600">{t('connections.repository')}</span>
                <input
                  value={repo}
                  onChange={(event) => setRepo(event.target.value)}
                  placeholder="owner/repo"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-[14px] outline-none focus:border-blue-300"
                />
              </label>
              <label>
                <span className="text-[12px] font-semibold text-slate-600">{t('connections.branch')}</span>
                <input
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  placeholder="main"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-[14px] outline-none focus:border-blue-300"
                />
              </label>
              <label className="md:col-span-2">
                <span className="text-[12px] font-semibold text-slate-600">{t('connections.token')}</span>
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  type="password"
                  placeholder={t('connections.tokenPlaceholder')}
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-[14px] outline-none focus:border-blue-300"
                />
              </label>
              <label>
                <span className="text-[12px] font-semibold text-slate-600">{t('connections.interval')}</span>
                <input
                  value={syncInterval}
                  onChange={(event) => setSyncInterval(event.target.value)}
                  type="number"
                  min={60}
                  step={60}
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-[14px] outline-none focus:border-blue-300"
                />
              </label>
              <label className="md:col-span-2">
                <span className="text-[12px] font-semibold text-slate-600">{t('connections.pathFilters')}</span>
                <textarea
                  value={paths}
                  onChange={(event) => setPaths(event.target.value)}
                  placeholder={'Optional, one prefix per line\nREADME.md\ndocs/\npackages/core/src/'}
                  rows={5}
                  className="mt-1 w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-[14px] leading-6 outline-none focus:border-blue-300"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-200 px-5 py-4">
              <button
                onClick={handleConnect}
                disabled={busy !== null || !repo.trim()}
                className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-[13px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plug size={15} />
                {busy === 'connect' ? t('connections.connecting') : t('connections.connect')}
              </button>
              <button
                onClick={handleSync}
                disabled={busy !== null || !githubConnector}
                className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-4 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCw size={15} />
                {busy === 'sync' ? t('connections.syncing') : t('connections.syncNow')}
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-[16px] font-semibold">{t('connections.registeredConnectors')}</h3>
              <p className="mt-1 text-[13px] text-slate-500">{t('connections.liveState')}</p>
            </div>
            {loading ? (
              <div className="px-5 py-10 text-center text-[14px] text-slate-400">{t('connections.loading')}</div>
            ) : connectors.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <GitBranch size={26} className="mx-auto text-slate-300" />
                <p className="mt-3 text-[14px] font-medium text-slate-700">{t('connections.empty')}</p>
                <p className="mt-1 text-[13px] text-slate-400">{t('connections.emptyDetail')}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {connectors.map((connector) => (
                  <div key={connector.connectorId} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-slate-900">{connector.name}</p>
                        <p className="mt-1 truncate text-[12px] text-slate-400">{connector.repo || connector.type}</p>
                      </div>
                      <StatusBadge status={connector.status} />
                    </div>
                    <p className="mt-3 text-[12px] text-slate-500">{t('connections.lastSync', { value: formatDate(connector.lastSyncedAt, locale) })}</p>
                    <p className="mt-1 text-[12px] text-slate-500">{t('connections.intervalEvery', { seconds: connector.syncIntervalSeconds || 300 })}</p>
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
