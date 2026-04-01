import React, { useEffect } from 'react'
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark')
  }, [effectiveTheme])

  const Page = PAGES[currentPage] || ChatPage

  return (
    <>
      <CommandPalette />
      <Layout>
        <Page />
      </Layout>
    </>
  )
}
