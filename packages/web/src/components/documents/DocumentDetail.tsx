import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Database, FileText, FolderPlus, Hash, RefreshCw, Trash2 } from 'lucide-react'
import { addDocumentToCollection, deleteDocument, getDocument, listCollections } from '../../lib/api'
import type { Collection, Document } from '../../lib/types'
import { useAppStore } from '../../stores/appStore'
import { translate as tr, type Locale } from '../../lib/i18n'

interface Props {
  documentId: string
  onBack: () => void
  onDeleted: () => void
}

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return tr(locale, 'common.notRecorded')
  return new Date(value).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US')
}

function formatSize(bytes: number | null | undefined, locale: Locale) {
  if (!bytes) return tr(locale, 'common.notRecorded')
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function statusTone(status: string) {
  if (status === 'indexed') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'error') return 'border-red-200 bg-red-50 text-red-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className={`mt-1 min-w-0 break-words text-[13px] text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}

export function DocumentDetail({ documentId, onBack, onDeleted }: Props) {
  const { locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [document, setDocument] = useState<Document | null>(null)
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const [doc, collectionData] = await Promise.all([getDocument(documentId), listCollections()])
      setDocument(doc)
      setCollections(collectionData.collections)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('docDetail.notFound'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [documentId])

  const retrievalReadiness = useMemo(() => {
    if (!document) return t('common.unknown')
    if (document.status !== 'indexed') return t('docDetail.notReady')
    if (document.chunk_count === 0) return t('docDetail.noChunks')
    return t('docDetail.ready')
  }, [document, locale])

  const handleDelete = async () => {
    if (!document || !confirm(t('documents.deleteConfirm', { title: document.title }))) return
    setBusy(true)
    setError(null)
    try {
      await deleteDocument(document.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('documents.deleteError'))
    } finally {
      setBusy(false)
    }
  }

  const handleAddToCollection = async () => {
    if (!document || !selectedCollectionId) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await addDocumentToCollection(selectedCollectionId, document.id)
      const collection = collections.find((item) => item.id === selectedCollectionId)
      setMessage(t('docDetail.addedTo', { name: collection?.name || t('collections.title') }))
      setSelectedCollectionId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('collections.addError'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 p-8 text-[14px] text-slate-400">
        {t('docDetail.loading')}
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="min-h-full bg-slate-50 px-6 py-6">
        <div className="mx-auto max-w-4xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || t('docDetail.notFound')}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-slate-50 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-5xl space-y-5">
        <button
          onClick={onBack}
          className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft size={15} />
          {t('docDetail.back')}
        </button>

        {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText size={20} className="shrink-0 text-blue-600" />
                  <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${statusTone(document.status)}`}>
                    {document.status}
                  </span>
                </div>
                <h2 className="mt-3 truncate text-[26px] font-semibold tracking-normal text-slate-950">{document.title}</h2>
                <p className="mt-2 break-words text-[13px] leading-5 text-slate-500">{document.source_path}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => void refresh()}
                  className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-[13px] font-medium text-slate-600 hover:bg-slate-50"
                >
                  <RefreshCw size={15} />
                  {t('common.refresh')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-[13px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 size={15} />
                  {t('common.delete')}
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-3">
            <Field label={t('docDetail.retrievalReadiness')} value={retrievalReadiness} />
            <Field label={t('common.chunks')} value={document.chunk_count} />
            <Field label={t('docDetail.fileSize')} value={formatSize(document.file_size_bytes, locale)} />
            <Field label={t('docDetail.sourceType')} value={document.source_type} />
            <Field label={t('docDetail.fileType')} value={document.file_type || t('common.notRecorded')} />
            <Field label={t('docDetail.connector')} value={document.connector_id || t('docDetail.directUpload')} />
            <Field label={t('docDetail.created')} value={formatDate(document.created_at, locale)} />
            <Field label={t('docDetail.updated')} value={formatDate(document.updated_at, locale)} />
            <Field label={t('docDetail.indexed')} value={formatDate(document.indexed_at, locale)} />
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Hash size={17} className="text-slate-500" />
              <h3 className="text-[15px] font-semibold text-slate-950">{t('docDetail.integrity')}</h3>
            </div>
            <div className="mt-4 grid gap-3">
              <Field label={t('docDetail.documentId')} value={document.id} mono />
              <Field label={t('docDetail.contentHash')} value={document.content_hash || t('common.notRecorded')} mono />
              {document.error_message && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-red-400">{t('docDetail.indexingError')}</p>
                  <p className="mt-1 text-[13px] leading-5 text-red-700">{document.error_message}</p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <FolderPlus size={17} className="text-blue-600" />
              <h3 className="text-[15px] font-semibold text-slate-950">{t('docDetail.collectionAssignment')}</h3>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-slate-500">
              {t('docDetail.collectionHelp')}
            </p>
            <div className="mt-4 space-y-3">
              <select
                value={selectedCollectionId}
                onChange={(event) => setSelectedCollectionId(event.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-blue-300"
              >
                <option value="">{t('docDetail.selectCollection')}</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>{collection.name}</option>
                ))}
              </select>
              <button
                onClick={handleAddToCollection}
                disabled={busy || !selectedCollectionId}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Database size={15} />
                {t('docDetail.addToCollection')}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
