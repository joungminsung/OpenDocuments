import React, { useEffect, useState } from 'react'
import { Layout } from './components/layout/Layout'
import { useAppStore } from './stores/appStore'
import { ChatPage } from './components/chat/ChatPage'
import { DocumentsPage } from './components/documents/DocumentsPage'
import { SettingsPage } from './components/settings/SettingsPage'
import { HealthPage } from './components/health/HealthPage'
import { ConnectorsPage } from './components/connectors/ConnectorsPage'
import { CommandPalette } from './components/layout/CommandPalette'
import { WorkspacesPage } from './components/workspaces/WorkspacesPage'
import { PluginsPage } from './components/plugins/PluginsPage'
import { UnifiedDashboard } from './components/dashboard/UnifiedDashboard'
import { LoginPage } from './components/auth/LoginPage'
import { CollectionsPage } from './components/collections/CollectionsPage'
import { getHealth } from './lib/api'
import { clearStoredApiKey, setStoredApiKey } from './lib/auth'
import { translate as tr } from './lib/i18n'

const PAGES: Record<string, () => React.ReactElement> = {
  dashboard: UnifiedDashboard,
  chat: ChatPage,
  documents: DocumentsPage,
  collections: CollectionsPage,
  settings: SettingsPage,
  health: HealthPage,
  connectors: ConnectorsPage,
  plugins: PluginsPage,
  workspaces: WorkspacesPage,
}

export function App() {
  const { currentPage, effectiveTheme, locale } = useAppStore()
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated' | 'unavailable'>('checking')
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark')
  }, [effectiveTheme])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    let cancelled = false

    async function checkAuth() {
      try {
        await getHealth()
        if (!cancelled) {
          setAuthState('authenticated')
          setAuthError(null)
        }
      } catch (error) {
        if (cancelled) return

        if (error instanceof Error && /^HTTP (401|403)$/.test(error.message)) {
          setAuthState('unauthenticated')
          return
        }

        setAuthState('unavailable')
        setAuthError(error instanceof Error ? error.message : tr(locale, 'app.serverUnavailable'))
      }
    }

    void checkAuth()

    return () => {
      cancelled = true
    }
  }, [])

  const handleLogin = async (apiKey: string) => {
    setStoredApiKey(apiKey)
    setAuthState('checking')
    setAuthError(null)

    try {
      await getHealth()
      setAuthState('authenticated')
    } catch (error) {
      clearStoredApiKey()
      setAuthState('unauthenticated')
      setAuthError(tr(locale, 'login.authFailed'))
    }
  }

  const Page = PAGES[currentPage] || ChatPage

  if (authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600 dark:bg-gray-950 dark:text-gray-300">
        {tr(locale, 'app.checkingAuth')}
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <LoginPage onLogin={handleLogin} errorMessage={authError || undefined} />
  }

  if (authState === 'unavailable') {
    return (
      <div className="min-h-screen bg-stone-50 px-6 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto max-w-lg rounded-md border border-red-200 bg-white p-5 shadow-sm dark:border-red-900 dark:bg-slate-900">
          <h1 className="text-lg font-semibold">{tr(locale, 'app.notReachable')}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{authError}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <CommandPalette />
      <Layout>
        <Page />
      </Layout>
    </>
  )
}
