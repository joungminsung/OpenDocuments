import { useState, useEffect } from 'react'
import { getConnectorStatus } from '../../lib/api'
import type { ConnectorStatusResponse } from '../../lib/types'

export function ConnectorsPage() {
  const [connectors, setConnectors] = useState<ConnectorStatusResponse['connectors']>([])

  useEffect(() => {
    getConnectorStatus().then(d => setConnectors(d.connectors)).catch(() => {})
  }, [])

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h2 className="text-xl font-semibold mb-4">Connectors</h2>
      {connectors.length === 0 ? (
        <p className="text-gray-400 text-sm">No connectors configured. Add connectors in opendocuments.config.ts</p>
      ) : (
        <div className="space-y-2">
          {connectors.map(c => (
            <div key={c.connectorId} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-gray-400">Last sync: {c.lastSyncedAt || 'never'}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                c.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600'
              }`}>{c.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
