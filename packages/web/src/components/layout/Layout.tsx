import { Sidebar } from './Sidebar'
import { useAppStore } from '../../stores/appStore'
import { useEffect, useState } from 'react'
import { CircleHelp, Sun } from 'lucide-react'
import { getWorkbench } from '../../lib/api'
import type { WorkbenchResponse } from '../../lib/types'
import { translate as tr } from '../../lib/i18n'

export function Layout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme, locale, setLocale, setPage } = useAppStore()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const [workbench, setWorkbench] = useState<WorkbenchResponse | null>(null)
  const [reachable, setReachable] = useState(true)

  useEffect(() => {
    let cancelled = false
    getWorkbench()
      .then((result) => {
        if (!cancelled) {
          setWorkbench(result)
          setReachable(true)
        }
      })
      .catch(() => {
        if (!cancelled) setReachable(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setupRequired = Boolean(workbench && (
    workbench.health.modelStatus !== 'ready' || workbench.corpus.documents === 0
  ))
  const statusLabel = !reachable
    ? tr(locale, 'layout.systemOffline')
    : !workbench
      ? tr(locale, 'layout.checking')
      : setupRequired
        ? tr(locale, 'layout.setupRequired')
        : tr(locale, 'layout.systemHealthy')
  const statusDot = !reachable
    ? 'bg-red-500'
    : !workbench
      ? 'bg-slate-400'
      : setupRequired
        ? 'bg-amber-500'
        : 'bg-emerald-500'

  return (
    <div className="flex h-screen overflow-hidden bg-white text-slate-950">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[72px] items-center justify-end border-b border-slate-200 bg-white px-3 sm:px-5 xl:px-7">
          <div className="flex items-center gap-2.5 sm:gap-4 xl:gap-6">
            <button
              type="button"
              onClick={() => setPage(setupRequired ? 'chat' : 'health')}
              className="flex h-9 items-center gap-2.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-[14px] font-medium text-slate-600 shadow-sm hover:bg-slate-50 sm:px-4"
              aria-label={statusLabel}
              title={statusLabel}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${statusDot}`} />
              <span className="hidden sm:inline">{statusLabel}</span>
            </button>
            <a
              href="https://joungminsung.github.io/OpenDocuments/"
              target="_blank"
              rel="noreferrer"
              className="text-slate-500 hover:text-slate-900"
              aria-label={tr(locale, 'layout.help')}
            >
              <CircleHelp size={22} strokeWidth={1.9} />
            </a>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value === 'ko' ? 'ko' : 'en')}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 shadow-sm outline-none hover:bg-slate-50"
              aria-label={tr(locale, 'layout.language')}
            >
              <option value="en">EN</option>
              <option value="ko">KO</option>
            </select>
            <button
              className="text-slate-500 hover:text-slate-900"
              aria-label={tr(locale, 'layout.toggleTheme')}
              onClick={() => setTheme(nextTheme)}
            >
              <Sun size={23} strokeWidth={1.8} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
