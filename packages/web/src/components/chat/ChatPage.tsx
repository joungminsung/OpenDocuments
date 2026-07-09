import { useRef, useEffect, useState } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useAppStore } from '../../stores/appStore'
import { ChatInput } from './ChatInput'
import { ChatMessage } from './ChatMessage'
import { streamChat } from '../../lib/sse'
import { getWorkbench, listConversations, submitFeedback, updateConversation, uploadDocument } from '../../lib/api'
import type { WorkbenchResponse } from '../../lib/types'
import { translate as tr } from '../../lib/i18n'

export function ChatPage() {
  const {
    messages,
    isStreaming,
    currentStreamText,
    currentSources,
    currentConfidence,
    conversationId,
    conversations,
    activeError,
  } = useChatStore()
  const { profile, locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [workbench, setWorkbench] = useState<WorkbenchResponse | null>(null)
  const [workbenchError, setWorkbenchError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const healthStatus = workbenchError ? 'offline' : 'ready'
  const showPreview = messages.length === 0 && !isStreaming
  const suggestedQuestions = workbench?.suggestedQuestions ?? []
  const activeConversation = conversations.find((conversation) => conversation.id === conversationId)
  const activeConversationTitle = activeConversation?.title || (conversationId ? t('chat.untitled') : t('chat.newChat'))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentStreamText])

  const refreshWorkbench = async () => {
    try {
      const result = await getWorkbench()
      setWorkbench(result)
      setWorkbenchError(null)
    } catch (error) {
      setWorkbenchError(error instanceof Error ? error.message : t('chat.errorWorkbench'))
    }
  }

  const refreshConversations = async () => {
    useChatStore.getState().setConversationsLoading(true)
    try {
      const result = await listConversations({ limit: 80 })
      useChatStore.getState().setConversations(result.conversations)
    } catch (error) {
      useChatStore.getState().setActiveError(error instanceof Error ? error.message : t('chat.errorSessions'))
    } finally {
      useChatStore.getState().setConversationsLoading(false)
    }
  }

  useEffect(() => {
    void refreshConversations()
    void refreshWorkbench()
  }, [])

  const handleSend = async (query: string) => {
    const store = useChatStore.getState()
    const startingConversationId = store.conversationId
    store.addUserMessage(query)
    store.startStreaming()

    abortRef.current = new AbortController()

    try {
      await streamChat(query, profile, conversationId, {
        onChunk: (text) => useChatStore.getState().appendStreamChunk(text),
        onSources: (sources) => useChatStore.getState().setSources(sources),
        onConfidence: (confidence) => useChatStore.getState().setConfidence(confidence),
        onDone: (data) => {
          if (data.conversationId) useChatStore.getState().setConversationId(data.conversationId)
          useChatStore.getState().finishStreaming(data.profile || profile, data.queryId)
          if (!startingConversationId && data.conversationId) {
            const title = query.trim().replace(/\s+/g, ' ').slice(0, 72)
            void updateConversation(data.conversationId, { title })
              .catch(() => {})
              .finally(() => void refreshConversations())
          } else {
            void refreshConversations()
          }
          void refreshWorkbench()
        },
        onError: (error) => {
          useChatStore.getState().failStreaming(`${t('common.error')}: ${error}`, profile)
        },
      }, abortRef.current.signal)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        useChatStore.getState().failStreaming(t('chat.cancelled'), profile)
        return
      }
      useChatStore.getState().failStreaming(error instanceof Error ? error.message : t('chat.errorStream'), profile)
    }
  }

  const handleNewChat = () => {
    abortRef.current?.abort()
    useChatStore.getState().clearMessages()
  }

  const handleAttach = async (file: File) => {
    setUploading(true)
    useChatStore.getState().setActiveError(null)
    try {
      await uploadDocument(file)
      await refreshWorkbench()
    } catch (error) {
      useChatStore.getState().setActiveError(error instanceof Error ? error.message : t('chat.errorUpload'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-full bg-white text-slate-950">
      {(activeError || workbenchError) && (
        <div className="mx-auto mt-5 max-w-[860px] rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {activeError || workbenchError}
        </div>
      )}

      <section className={`${showPreview ? 'pt-14' : 'pt-7'} pb-10`}>
        <div className="mx-auto max-w-[860px] px-5">
          {showPreview && (
            <div className="mb-8 text-center">
              <h1 className="text-[34px] font-medium leading-tight tracking-[-0.015em] text-slate-950">
                {t('chat.title')}
              </h1>
              <p className="mt-2 text-[16px] leading-6 text-slate-500">
                {t('chat.subtitle')}
              </p>
            </div>
          )}

          {!showPreview && (
            <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-slate-950">{activeConversationTitle}</p>
                <p className="mt-0.5 text-[12px] text-slate-400">
                  {conversationId ? t('chat.savedConversation') : t('chat.draftConversation')} · {t('chat.messages', { count: messages.length })}
                </p>
              </div>
              <button
                onClick={handleNewChat}
                className="h-8 shrink-0 rounded-md border border-slate-200 px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
              >
                {t('chat.newChat')}
              </button>
            </div>
          )}

          <ChatInput
            onSend={handleSend}
            onAttach={handleAttach}
            disabled={isStreaming || healthStatus === 'offline'}
            uploading={uploading}
            className={showPreview ? '' : 'mb-7'}
          />

          {showPreview && suggestedQuestions.length > 0 && (
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {suggestedQuestions.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSend(prompt)}
                  className="h-9 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-medium text-blue-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {!showPreview && (
            <div className="space-y-5">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  onFeedback={msg.queryId ? ((type) => {
                    submitFeedback(msg.queryId as string, type).catch(() => {})
                  }) : undefined}
                />
              ))}
              {isStreaming && currentStreamText && (
                <ChatMessage
                  message={{
                    id: 'streaming',
                    role: 'assistant',
                    content: currentStreamText,
                    sources: currentSources.length > 0 ? currentSources : undefined,
                    confidence: currentConfidence || undefined,
                    timestamp: Date.now(),
                  }}
                  isStreaming
                />
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {workbench && workbench.corpus.documents > 0 && showPreview && (
            <p className="mt-5 text-center text-xs text-slate-400">
              {t('chat.indexSummary', {
                documents: workbench.corpus.documents,
                active: workbench.connectors.active,
                total: workbench.connectors.total,
              })}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
