import { useState, useEffect } from 'react'
import { listDocuments, deleteDocument } from '../../lib/api'
import { UploadZone } from './UploadZone'
import { DocumentDetail } from './DocumentDetail'
import type { Document } from '../../lib/types'

export function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const result = await listDocuments()
      setDocs(result.documents)
    } catch (err) {
      console.error('Failed to load documents:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document and all its chunks?')) return
    try {
      await deleteDocument(id)
      refresh()
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  if (selectedDocId) {
    return <DocumentDetail documentId={selectedDocId} onBack={() => setSelectedDocId(null)} />
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h2 className="text-xl font-semibold mb-4">Documents</h2>

      <UploadZone onUploaded={refresh} />

      {loading ? (
        <p className="text-gray-400 text-sm mt-4">Loading...</p>
      ) : docs.length === 0 ? (
        <div className="mt-8 text-center text-gray-400">
          <p>No documents indexed yet.</p>
          <p className="text-sm mt-1">Upload files above or use <code className="text-primary-500">opendocuments index ./docs</code></p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
            >
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setSelectedDocId(doc.id)}>
                <p className="text-sm font-medium truncate hover:text-primary-500 transition-colors">{doc.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {doc.source_type} · {doc.chunk_count} chunks · {doc.status}
                  {doc.indexed_at && ` · ${new Date(doc.indexed_at).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <span className={`w-2 h-2 rounded-full ${
                  doc.status === 'indexed' ? 'bg-green-500' :
                  doc.status === 'error' ? 'bg-red-500' :
                  'bg-yellow-500'
                }`} />
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
