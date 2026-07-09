import { useEffect, useMemo, useState } from 'react'
import { Folder, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import {
  addDocumentToCollection,
  createCollection,
  deleteCollection,
  getCollectionDocuments,
  listCollections,
  listDocuments,
  removeDocumentFromCollection,
} from '../../lib/api'
import type { Collection, Document } from '../../lib/types'
import { useAppStore } from '../../stores/appStore'
import { translate as tr, type Locale } from '../../lib/i18n'

function formatDate(value: string | null | undefined, locale: Locale) {
  if (!value) return tr(locale, 'common.notRecorded')
  return new Date(value).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US')
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'indexed'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-amber-200 bg-amber-50 text-amber-700'

  return <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone}`}>{status}</span>
}

export function CollectionsPage() {
  const { locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [collections, setCollections] = useState<Collection[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedDocs, setSelectedDocs] = useState<Document[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [query, setQuery] = useState('')
  const [documentToAdd, setDocumentToAdd] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedCollection = collections.find((collection) => collection.id === selectedId) || null
  const filteredCollections = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return collections
    return collections.filter((collection) => {
      return collection.name.toLowerCase().includes(normalized)
        || (collection.description || '').toLowerCase().includes(normalized)
    })
  }, [collections, query])

  const availableDocuments = documents.filter((document) => !selectedDocs.some((item) => item.id === document.id))

  const refresh = async (nextSelectedId = selectedId) => {
    setLoading(true)
    setError(null)
    try {
      const [collectionData, documentData] = await Promise.all([listCollections(), listDocuments()])
      setCollections(collectionData.collections)
      setDocuments(documentData.documents)
      const resolvedId = nextSelectedId || collectionData.collections[0]?.id || null
      setSelectedId(resolvedId)

      if (resolvedId) {
        const detail = await getCollectionDocuments(resolvedId)
        setSelectedDocs(detail.documents)
      } else {
        setSelectedDocs([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('collections.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const selectCollection = async (collectionId: string) => {
    setSelectedId(collectionId)
    setError(null)
    try {
      const detail = await getCollectionDocuments(collectionId)
      setSelectedDocs(detail.documents)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('collections.loadError'))
    }
  }

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      const collection = await createCollection({ name: trimmed, description: description.trim() || undefined })
      setName('')
      setDescription('')
      await refresh(collection.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('collections.createError'))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (collection: Collection) => {
    if (!confirm(t('collections.deleteConfirm', { name: collection.name }))) return
    setBusy(true)
    setError(null)
    try {
      await deleteCollection(collection.id)
      await refresh(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('collections.deleteError'))
    } finally {
      setBusy(false)
    }
  }

  const handleAddDocument = async () => {
    if (!selectedId || !documentToAdd) return
    setBusy(true)
    setError(null)
    try {
      await addDocumentToCollection(selectedId, documentToAdd)
      setDocumentToAdd('')
      await selectCollection(selectedId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('collections.addError'))
    } finally {
      setBusy(false)
    }
  }

  const handleRemoveDocument = async (documentId: string) => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      await removeDocumentFromCollection(selectedId, documentId)
      await selectCollection(selectedId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('collections.removeError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full bg-slate-50 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-blue-600">{t('collections.eyebrow')}</p>
            <h2 className="mt-1 text-[26px] font-semibold tracking-normal">{t('collections.title')}</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-500">
              {t('collections.subtitle')}
            </p>
          </div>
          <button
            onClick={() => refresh().catch(() => {})}
            className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={15} />
            {t('common.refresh')}
          </button>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-[14px] font-semibold text-slate-950">{t('collections.new')}</h3>
              <div className="mt-4 space-y-3">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('collections.namePlaceholder')}
                  className="h-9 w-full rounded-md border border-slate-200 px-3 text-[13px] outline-none focus:border-blue-300"
                />
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t('collections.descriptionPlaceholder')}
                  rows={3}
                  className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-[13px] leading-5 outline-none focus:border-blue-300"
                />
                <button
                  onClick={handleCreate}
                  disabled={busy || !name.trim()}
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-blue-600 text-[13px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={15} />
                  {t('common.create')}
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('collections.searchPlaceholder')}
                  className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-[13px] outline-none focus:border-blue-300"
                />
              </div>
              <div className="mt-4 space-y-2">
                {loading ? (
                  <p className="text-[13px] text-slate-400">{t('collections.loading')}</p>
                ) : filteredCollections.length === 0 ? (
                  <p className="text-[13px] leading-5 text-slate-400">{t('collections.empty')}</p>
                ) : (
                  filteredCollections.map((collection) => (
                    <button
                      key={collection.id}
                      onClick={() => void selectCollection(collection.id)}
                      className={`flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors ${
                        selectedId === collection.id
                          ? 'border-blue-200 bg-blue-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <Folder size={17} className="mt-0.5 shrink-0 text-blue-600" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-slate-900">{collection.name}</span>
                        <span className="mt-1 line-clamp-2 block text-[12px] leading-4 text-slate-500">
                          {collection.description || t('common.noDescription')}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
          </aside>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            {selectedCollection ? (
              <>
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-[18px] font-semibold text-slate-950">{selectedCollection.name}</h3>
                      <p className="mt-1 text-[13px] leading-5 text-slate-500">
                        {selectedCollection.description || t('common.noDescription')}
                      </p>
                      <p className="mt-2 text-[12px] text-slate-400">{t('docDetail.created')} {formatDate(selectedCollection.createdAt, locale)}</p>
                    </div>
                    <button
                      onClick={() => void handleDelete(selectedCollection)}
                      disabled={busy}
                      className="flex h-8 items-center gap-2 rounded-md border border-red-200 px-2.5 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 size={14} />
                      {t('common.delete')}
                    </button>
                  </div>
                </div>

                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value={documentToAdd}
                      onChange={(event) => setDocumentToAdd(event.target.value)}
                      className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-blue-300"
                    >
                      <option value="">{t('collections.selectDocument')}</option>
                      {availableDocuments.map((document) => (
                        <option key={document.id} value={document.id}>{document.title}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAddDocument}
                      disabled={busy || !documentToAdd}
                      className="h-9 rounded-md bg-slate-950 px-4 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('collections.addDocument')}
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {selectedDocs.length === 0 ? (
                    <div className="px-5 py-10 text-center">
                      <p className="text-[14px] font-medium text-slate-700">{t('collections.noDocs')}</p>
                      <p className="mt-1 text-[13px] text-slate-400">{t('collections.noDocsDetail')}</p>
                    </div>
                  ) : (
                    selectedDocs.map((document) => (
                      <div key={document.id} className="flex items-center justify-between gap-4 px-5 py-4">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-slate-900">{document.title}</p>
                          <p className="mt-1 truncate text-[12px] text-slate-400">
                            {document.source_type} · {document.chunk_count} {t('common.chunks')} · {document.source_path}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <StatusBadge status={document.status} />
                          <button
                            onClick={() => void handleRemoveDocument(document.id)}
                            disabled={busy}
                            className="text-[12px] font-medium text-slate-500 hover:text-red-600 disabled:opacity-50"
                          >
                            {t('common.remove')}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="px-5 py-16 text-center">
                <Folder size={28} className="mx-auto text-slate-300" />
                <p className="mt-3 text-[14px] font-medium text-slate-700">{t('collections.createPrompt')}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
