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
import { getHealth } from './lib/api'
import { clearStoredApiKey, setStoredApiKey } from './lib/auth'

const PAGES: Record<string, () => React.ReactElement> = {
  dashboard: UnifiedDashboard,
  chat: ChatPage,
  documents: DocumentsPage,
  settings: SettingsPage,
  health: HealthPage,
  connectors: ConnectorsPage,
  plugins: PluginsPage,
  workspaces: WorkspacesPage,
}

export function App() {
  const { currentPage, effectiveTheme } = useAppStore()
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>('checking')
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark')
  }, [effectiveTheme])

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

        setAuthState('authenticated')
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
      setAuthError('Authentication failed. Check the API key or sign in again.')
    }
  }

  const Page = PAGES[currentPage] || ChatPage

  if (authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-600 dark:bg-gray-950 dark:text-gray-300">
        Checking authentication...
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <LoginPage onLogin={handleLogin} errorMessage={authError || undefined} />
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
