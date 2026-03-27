import { useRef, useEffect } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useAppStore } from '../../stores/appStore'
import { ChatInput } from './ChatInput'
import { ChatMessage } from './ChatMessage'
import { streamChat } from '../../lib/sse'
import { submitFeedback } from '../../lib/api'

export function ChatPage() {
  const { messages, isStreaming, currentStreamText, currentSources, currentConfidence } = useChatStore()
  const { profile } = useAppStore()
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentStreamText])

  // TODO: Create conversation on first message and persist conversationId
  // Blocked by: streaming endpoint needs to persist messages (I8 fix)
  const handleSend = async (query: string) => {
    const store = useChatStore.getState()
    store.addUserMessage(query)
    store.startStreaming()

    abortRef.current = new AbortController()

    await streamChat(query, profile, {
      onChunk: (text) => useChatStore.getState().appendStreamChunk(text),
      onSources: (sources) => useChatStore.getState().setSources(sources),
      onConfidence: (confidence) => useChatStore.getState().setConfidence(confidence),
      onDone: (data) => useChatStore.getState().finishStreaming(data.profile || profile, data.queryId),
      onError: (error) => {
        useChatStore.getState().appendStreamChunk(`\n\nError: ${error}`)
        useChatStore.getState().finishStreaming(profile)
      },
    }, abortRef.current.signal)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !isStreaming ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <h2 className="text-2xl font-semibold text-gray-700 dark:text-gray-300">OpenDocs</h2>
            <p className="mt-2 text-gray-400 max-w-md">
              Ask questions about your indexed documents. Start by uploading documents in the Documents page.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                onFeedback={(type) => {
                  if (msg.queryId) submitFeedback(msg.queryId, type).catch(() => {})
                }}
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
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <ChatInput onSend={handleSend} disabled={isStreaming} />
        </div>
      </div>
    </div>
  )
}
