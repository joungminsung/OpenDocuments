import { useState, useEffect } from 'react'

export function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<any[]>([])
  useEffect(() => {
    fetch('/api/v1/workspaces')
      .then(r => r.json())
      .then(d => setWorkspaces(d.workspaces ?? []))
      .catch(() => {
        // Fallback if endpoint not available
        setWorkspaces([{ name: 'default', mode: 'personal' }])
      })
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h2 className="text-xl font-semibold mb-4">Workspaces</h2>
      <div className="space-y-2">
        {workspaces.map(ws => (
          <div key={ws.name} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium">{ws.name}</p>
              <p className="text-xs text-gray-400">{ws.mode}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-gray-400">Manage workspaces via CLI: opendocuments workspace create/switch/delete</p>
    </div>
  )
}
