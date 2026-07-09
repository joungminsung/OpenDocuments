import { useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, FileText, RefreshCw, Search, Trash2 } from 'lucide-react'
import { deleteDocument, listDocuments } from '../../lib/api'
import { UploadZone } from './UploadZone'
import { DocumentDetail } from './DocumentDetail'
import type { Document } from '../../lib/types'
import { useAppStore } from '../../stores/appStore'
import { translate as tr, type Locale } from '../../lib/i18n'

type SortKey = 'updated' | 'title' | 'chunks'

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return tr(locale, 'common.notIndexed')
  return new Date(value).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US')
}

function statusTone(status: string) {
  if (status === 'indexed') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'error') return 'border-red-200 bg-red-50 text-red-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function Stat({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[22px] font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-[12px] font-medium text-slate-500">{label}</p>
      {detail && <p className="mt-0.5 text-[11px] text-slate-400">{detail}</p>}
    </div>
  )
}

export function DocumentsPage() {
  const { locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('updated')

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listDocuments()
      setDocs(result.documents)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('documents.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const sourceTypes = useMemo(() => {
    return Array.from(new Set(docs.map((doc) => doc.source_type).filter(Boolean))).sort()
  }, [docs])

  const statusTypes = useMemo(() => {
    return Array.from(new Set(docs.map((doc) => doc.status).filter(Boolean))).sort()
  }, [docs])

  const filteredDocs = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const nextDocs = docs.filter((doc) => {
      const matchesQuery = !normalized
        || doc.title.toLowerCase().includes(normalized)
        || doc.source_path.toLowerCase().includes(normalized)
        || doc.source_type.toLowerCase().includes(normalized)
      const matchesStatus = statusFilter === 'all' || doc.status === statusFilter
      const matchesSource = sourceFilter === 'all' || doc.source_type === sourceFilter
      return matchesQuery && matchesStatus && matchesSource
    })

    return nextDocs.sort((a, b) => {
      if (sortKey === 'title') return a.title.localeCompare(b.title)
      if (sortKey === 'chunks') return b.chunk_count - a.chunk_count
      const left = new Date(a.updated_at || a.indexed_at || a.created_at).getTime()
      const right = new Date(b.updated_at || b.indexed_at || b.created_at).getTime()
      return right - left
    })
  }, [docs, query, sortKey, sourceFilter, statusFilter])

  const indexedCount = docs.filter((doc) => doc.status === 'indexed').length
  const errorCount = docs.filter((doc) => doc.status === 'error').length
  const chunkCount = docs.reduce((sum, doc) => sum + doc.chunk_count, 0)

  const handleDelete = async (doc: Document) => {
    if (!confirm(t('documents.deleteConfirm', { title: doc.title }))) return
    try {
      await deleteDocument(doc.id)
      if (selectedDocId === doc.id) setSelectedDocId(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('documents.deleteError'))
    }
  }

  if (selectedDocId) {
    return (
      <DocumentDetail
        documentId={selectedDocId}
        onBack={() => setSelectedDocId(null)}
        onDeleted={() => {
          setSelectedDocId(null)
          void refresh()
        }}
      />
    )
  }

  return (
    <div className="min-h-full bg-slate-50 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-blue-600">{t('documents.eyebrow')}</p>
            <h2 className="mt-1 text-[26px] font-semibold tracking-normal">{t('documents.title')}</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-500">
              {t('documents.subtitle')}
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={15} />
            {t('common.refresh')}
          </button>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('common.documents')} value={docs.length} detail={t('documents.indexed', { count: indexedCount })} />
          <Stat label={t('common.chunks')} value={chunkCount} detail={t('documents.retrievalUnits')} />
          <Stat label={t('documents.sourceTypes')} value={sourceTypes.length} />
          <Stat label={t('documents.errors')} value={errorCount} detail={errorCount > 0 ? t('documents.needsAttention') : t('documents.none')} />
        </section>

        <UploadZone onUploaded={refresh} />

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4">
            <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_160px]">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('documents.searchPlaceholder')}
                  className="h-10 w-full rounded-md border border-slate-200 pl-9 pr-3 text-[14px] outline-none focus:border-blue-300"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-blue-300"
              >
                <option value="all">{t('documents.allStatuses')}</option>
                {statusTypes.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-blue-300"
              >
                <option value="all">{t('documents.allSources')}</option>
                {sourceTypes.map((source) => <option key={source} value={source}>{source}</option>)}
              </select>
              <select
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-blue-300"
              >
                <option value="updated">{t('documents.sortUpdated')}</option>
                <option value="title">{t('documents.sortTitle')}</option>
                <option value="chunks">{t('documents.sortChunks')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_120px_110px_150px_70px] items-center gap-4 border-b border-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>{t('common.document')}</span>
            <span>{t('common.source')}</span>
            <span>{t('common.status')}</span>
            <span className="flex items-center gap-1"><ArrowDownUp size={12} /> {t('docDetail.updated')}</span>
            <span />
          </div>

          {loading ? (
            <div className="px-4 py-10 text-center text-[14px] text-slate-400">{t('documents.loading')}</div>
          ) : filteredDocs.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <FileText size={30} className="mx-auto text-slate-300" />
              <p className="mt-3 text-[14px] font-medium text-slate-700">{t('documents.empty')}</p>
              <p className="mt-1 text-[13px] text-slate-400">{t('documents.emptyDetail')}</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredDocs.map((doc) => (
                <div key={doc.id} className="grid grid-cols-[1fr_120px_110px_150px_70px] items-center gap-4 px-4 py-3 hover:bg-slate-50">
                  <button className="min-w-0 text-left" onClick={() => setSelectedDocId(doc.id)}>
                    <p className="truncate text-[14px] font-semibold text-slate-900 hover:text-blue-600">{doc.title}</p>
                    <p className="mt-1 truncate text-[12px] text-slate-400">{doc.source_path}</p>
                  </button>
                  <span className="truncate text-[13px] text-slate-600">{doc.source_type}</span>
                  <span>
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusTone(doc.status)}`}>
                      {doc.status}
                    </span>
                  </span>
                  <span className="text-[12px] text-slate-500">
                    {formatDate(doc.updated_at || doc.indexed_at || doc.created_at, locale)}
                    <span className="mt-0.5 block text-[11px] text-slate-400">{doc.chunk_count} {t('common.chunks')}</span>
                  </span>
                  <button
                    onClick={() => void handleDelete(doc)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`${t('common.delete')} ${doc.title}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
