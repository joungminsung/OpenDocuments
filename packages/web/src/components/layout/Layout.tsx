import { Sidebar } from './Sidebar'
import { useAppStore } from '../../stores/appStore'

export function Layout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen, toggleSidebar } = useAppStore()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 flex items-center px-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
          <button
            onClick={toggleSidebar}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mr-4"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
          {/* TODO: Show degraded mode banner when stub models are active (check /api/v1/admin/plugins for stub names) */}
          <span className="text-sm text-gray-500">OpenDocs</span>
        </header>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
