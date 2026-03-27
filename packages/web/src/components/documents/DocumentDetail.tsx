import { useState, useEffect } from 'react'

// Simple document detail with chunk list
export function DocumentDetail({ documentId, onBack }: { documentId: string; onBack: () => void }) {
  const [doc, setDoc] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/v1/documents/${documentId}`)
      .then(r => r.json())
      .then(setDoc)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [documentId])

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>
  if (!doc) return <div className="p-8 text-red-400">Document not found</div>

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button onClick={onBack} className="text-sm text-primary-500 hover:text-primary-700 mb-4">&larr; Back to Documents</button>
      <h2 className="text-xl font-semibold mb-2">{doc.title}</h2>
      <div className="flex gap-4 text-sm text-gray-400 mb-6">
        <span>{doc.source_type}</span>
        <span>{doc.chunk_count} chunks</span>
        <span className={`px-2 py-0.5 rounded-full text-xs ${
          doc.status === 'indexed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600'
        }`}>{doc.status}</span>
        {doc.indexed_at && <span>Indexed: {new Date(doc.indexed_at).toLocaleDateString()}</span>}
      </div>
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">Document Info</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-gray-400">ID:</span> <span className="font-mono text-xs">{doc.id}</span></div>
          <div><span className="text-gray-400">Source:</span> {doc.source_path}</div>
          <div><span className="text-gray-400">Type:</span> {doc.file_type || '-'}</div>
          <div><span className="text-gray-400">Hash:</span> <span className="font-mono text-xs">{doc.content_hash?.substring(0, 12) || '-'}...</span></div>
        </div>
      </div>
    </div>
  )
}
