import { useAppStore } from '../../stores/appStore'

const NAV_ITEMS = [
  { id: 'chat' as const, label: 'Chat', icon: '💬' },
  { id: 'documents' as const, label: 'Documents', icon: '📄' },
  { id: 'connectors' as const, label: 'Connectors', icon: '🔗' },
  { id: 'plugins' as const, label: 'Plugins', icon: '🧩' },
  { id: 'workspaces' as const, label: 'Workspaces', icon: '🏢' },
  { id: 'settings' as const, label: 'Settings', icon: '⚙️' },
  { id: 'health' as const, label: 'Admin', icon: '📊' },
]

export function Sidebar() {
  const { currentPage, setPage, theme, setTheme, sidebarOpen } = useAppStore()

  if (!sidebarOpen) return null

  return (
    <aside className="w-60 h-screen bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-lg font-bold text-primary-600">OpenDocuments</h1>
        <p className="text-xs text-gray-400">v0.1.0</p>
      </div>

      <nav className="flex-1 p-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
              currentPage === item.id
                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400 font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-gray-200 dark:border-gray-800">
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as any)}
          className="w-full text-xs bg-transparent border border-gray-300 dark:border-gray-700 rounded px-2 py-1"
        >
          <option value="system">System theme</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </aside>
  )
}
