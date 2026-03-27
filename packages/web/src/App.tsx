import React, { useEffect } from 'react'
import { Layout } from './components/layout/Layout'
import { useAppStore } from './stores/appStore'
import { ChatPage } from './components/chat/ChatPage'
import { DocumentsPage } from './components/documents/DocumentsPage'
import { SettingsPage } from './components/settings/SettingsPage'
import { HealthPage } from './components/health/HealthPage'
import { ConnectorsPage } from './components/connectors/ConnectorsPage'
import { CommandPalette } from './components/layout/CommandPalette'

const PAGES: Record<string, () => React.ReactElement> = {
  chat: ChatPage,
  documents: DocumentsPage,
  settings: SettingsPage,
  health: HealthPage,
  connectors: ConnectorsPage,
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
