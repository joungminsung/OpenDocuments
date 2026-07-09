import { useEffect, useMemo, useState } from 'react'
import { Briefcase, Database, RefreshCw, Shield } from 'lucide-react'
import { getWorkbench, listWorkspaces } from '../../lib/api'
import type { WorkbenchResponse, Workspace } from '../../lib/types'
import { useAppStore } from '../../stores/appStore'
import { translate as tr, type Locale } from '../../lib/i18n'

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return tr(locale, 'common.notRecorded')
  return new Date(value).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US')
}

function modeTone(mode: Workspace['mode']) {
  return mode === 'team'
    ? 'border-blue-200 bg-blue-50 text-blue-700'
    : 'border-slate-200 bg-slate-50 text-slate-700'
}

export function WorkspacesPage() {
  const { locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workbench, setWorkbench] = useState<WorkbenchResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const [workspaceData, workbenchData] = await Promise.all([listWorkspaces(), getWorkbench()])
      setWorkspaces(workspaceData.workspaces)
      setWorkbench(workbenchData)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('workspaces.empty'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const activeWorkspaceName = workbench?.workspace.name
  const activeWorkspace = useMemo(() => {
    return workspaces.find((workspace) => workspace.name === activeWorkspaceName) || workspaces[0] || null
  }, [activeWorkspaceName, workspaces])

  return (
    <div className="min-h-full bg-slate-50 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-blue-600">{t('workspaces.eyebrow')}</p>
            <h2 className="mt-1 text-[26px] font-semibold tracking-normal">{t('workspaces.title')}</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-500">
              {t('workspaces.subtitle')}
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

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center text-[14px] text-slate-400 shadow-sm">
            {t('common.loading')}
          </div>
        ) : (
          <>
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[22px] font-semibold">{workspaces.length}</p>
                <p className="mt-1 text-[12px] font-medium text-slate-500">{t('workspaces.total')}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[22px] font-semibold">{activeWorkspace?.name || t('common.unknown')}</p>
                <p className="mt-1 text-[12px] font-medium text-slate-500">{t('workspaces.current')}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <p className="text-[22px] font-semibold">{workbench?.workspace.mode || t('common.unknown')}</p>
                <p className="mt-1 text-[12px] font-medium text-slate-500">{t('workspaces.currentMode')}</p>
              </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
              <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h3 className="text-[16px] font-semibold">{t('workspaces.registry')}</h3>
                  <p className="mt-1 text-[13px] text-slate-500">{t('workspaces.registryDesc')}</p>
                </div>
                {workspaces.length === 0 ? (
                  <div className="px-5 py-12 text-center text-[14px] text-slate-400">{t('workspaces.empty')}</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {workspaces.map((workspace) => {
                      const isActive = workspace.name === activeWorkspaceName || workspace.id === activeWorkspaceName
                      return (
                        <div key={workspace.id} className={`grid gap-3 px-5 py-4 lg:grid-cols-[1fr_120px_190px] lg:items-center ${isActive ? 'bg-blue-50/50' : ''}`}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Briefcase size={16} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                              <p className="truncate text-[14px] font-semibold text-slate-900">{workspace.name}</p>
                              {isActive && <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{t('common.active')}</span>}
                            </div>
                            <p className="mt-1 truncate font-mono text-[11px] text-slate-400">{workspace.id}</p>
                          </div>
                          <span className={`w-fit rounded-md border px-2 py-0.5 text-[11px] font-medium ${modeTone(workspace.mode)}`}>
                            {workspace.mode}
                          </span>
                          <span className="text-[12px] text-slate-500">{t('docDetail.created')} {formatDate(workspace.createdAt, locale)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <aside className="space-y-5">
                <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Database size={17} className="text-slate-500" />
                    <h3 className="text-[15px] font-semibold">{t('workspaces.activeCorpus')}</h3>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[18px] font-semibold">{workbench?.corpus.documents ?? 0}</p>
                      <p className="text-[11px] text-slate-500">{t('common.documents')}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[18px] font-semibold">{workbench?.corpus.chunks ?? 0}</p>
                      <p className="text-[11px] text-slate-500">{t('common.chunks')}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Shield size={17} className="text-slate-500" />
                    <h3 className="text-[15px] font-semibold">{t('workspaces.managementPath')}</h3>
                  </div>
                  <p className="mt-3 text-[13px] leading-5 text-slate-500">
                    {t('workspaces.managementDesc')}
                  </p>
                  <div className="mt-4 rounded-md bg-slate-950 px-3 py-2 font-mono text-[12px] leading-5 text-slate-100">
                    opendocuments workspace create<br />
                    opendocuments workspace switch<br />
                    opendocuments workspace delete
                  </div>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
