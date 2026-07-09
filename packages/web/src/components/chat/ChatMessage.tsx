import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { SourceCard } from './SourceCard'
import type { ChatMessage as ChatMessageType, SearchResult } from '../../lib/types'
import { Info, X } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { translate as tr } from '../../lib/i18n'

interface Props {
  message: ChatMessageType
  isStreaming?: boolean
  onFeedback?: (type: 'positive' | 'negative') => void
}

export function ChatMessage({ message, isStreaming, onFeedback }: Props) {
  const { locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [selectedSource, setSelectedSource] = useState<SearchResult | null>(null)
  const isUser = message.role === 'user'
  const visibleSources = message.sources?.slice(0, 4) || []
  const confidence = message.confidence?.score
  const bestSourceScore = visibleSources.length > 0 ? Math.max(...visibleSources.map((source) => source.score)) : undefined
  const metricScore = bestSourceScore ?? confidence
  const metricLabel = bestSourceScore !== undefined ? t('chat.evidenceMatch') : t('chat.confidence')
  const sourceHeading = selectedSource?.headingHierarchy?.join(' / ')

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`${isUser ? 'max-w-[78%]' : 'w-full'}`}>
        {isUser ? (
          <div className="rounded-lg bg-blue-600 px-4 py-3 text-[15px] leading-relaxed text-white">
            <p>{message.content}</p>
          </div>
        ) : (
          <article className="rounded-lg border border-slate-200 bg-white px-6 py-6 shadow-sm">
            <div className="flex items-start justify-between gap-6">
              <div className="min-w-0">
                <p className="mb-2.5 text-[13px] font-medium text-blue-600">{t('chat.answer')}</p>
                <div className="prose prose-sm max-w-none prose-slate text-[15px] leading-6 [&_p:first-child]:mt-0 [&_p:first-child]:font-semibold [&_p:first-child]:text-slate-950 [&_p]:my-2">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              </div>
              {metricScore !== undefined && (
                <div className="w-[128px] shrink-0 pt-7">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
                      {metricLabel}
                      <Info size={11} strokeWidth={1.8} className="text-slate-300" />
                    </span>
                    <span className="text-[15px] font-semibold text-emerald-500">{Math.round(metricScore * 100)}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-slate-200">
                    <div className="h-1 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.round(metricScore * 100))}%` }} />
                  </div>
                </div>
              )}
            </div>

            {visibleSources.length > 0 && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-slate-900">{t('chat.sources')}</span>
                    <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-600">
                      {message.sources?.length || 0}
                    </span>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  {visibleSources.map((source, i) => (
                    <SourceCard
                      key={`${source.chunkId}-${i}`}
                      source={source}
                      onOpen={setSelectedSource}
                      openLabel={t('chat.openSource')}
                    />
                  ))}
                </div>
              </div>
            )}

            {!isStreaming && onFeedback && (
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => onFeedback?.('positive')}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  {t('chat.helpful')}
                </button>
                <button
                  onClick={() => onFeedback?.('negative')}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  {t('chat.notUseful')}
                </button>
              </div>
            )}
          </article>
        )}

        {selectedSource && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
            <div className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-blue-600">{t('chat.sourcePreview')}</p>
                  <h3 className="mt-1 truncate text-[17px] font-semibold text-slate-950">
                    {selectedSource.sourcePath.split('/').pop() || selectedSource.sourcePath}
                  </h3>
                  <p className="mt-1 break-words text-[12px] text-slate-500">{selectedSource.sourcePath}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSource(null)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={t('common.close')}
                >
                  <X size={17} />
                </button>
              </div>
              <div className="max-h-[calc(86vh-96px)] overflow-auto px-5 py-4">
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-slate-200 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase text-slate-400">{t('chat.match')}</p>
                    <p className="mt-1 text-[14px] font-semibold text-slate-900">{Math.round(selectedSource.score * 100)}%</p>
                  </div>
                  <div className="rounded-md border border-slate-200 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase text-slate-400">{t('chat.sourcePath')}</p>
                    <p className="mt-1 truncate text-[13px] text-slate-700">{sourceHeading || selectedSource.sourceType}</p>
                  </div>
                </div>
                <p className="mb-2 text-[12px] font-semibold text-slate-500">{t('chat.chunkContent')}</p>
                <div className="prose prose-sm max-w-none rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-6 text-slate-800">
                  <ReactMarkdown>{selectedSource.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        )}

        {isStreaming && !isUser && (
          <span className="ml-1 mt-2 inline-block h-4 w-1 animate-pulse bg-blue-500" />
        )}
      </div>
    </div>
  )
}
