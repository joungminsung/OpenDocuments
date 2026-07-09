import { create } from 'zustand'
import type { ChatMessage, SearchResult, ConfidenceResult, Conversation } from '../lib/types'

interface ChatState {
  messages: ChatMessage[]
  conversations: Conversation[]
  conversationsLoading: boolean
  isStreaming: boolean
  currentStreamText: string
  currentSources: SearchResult[]
  currentConfidence: ConfidenceResult | null
  conversationId: string | null
  activeError: string | null
  conversationSort: 'updated' | 'created' | 'title'

  addUserMessage: (content: string) => void
  setMessages: (messages: ChatMessage[]) => void
  setConversations: (conversations: Conversation[]) => void
  setConversationsLoading: (loading: boolean) => void
  startStreaming: () => void
  appendStreamChunk: (text: string) => void
  setSources: (sources: SearchResult[]) => void
  setConfidence: (confidence: ConfidenceResult) => void
  finishStreaming: (profile: string, queryId?: string) => void
  failStreaming: (message: string, profile: string) => void
  setConversationId: (id: string | null) => void
  setConversationSort: (sort: 'updated' | 'created' | 'title') => void
  clearMessages: () => void
  setActiveError: (message: string | null) => void
}

let messageCounter = 0

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  conversations: [],
  conversationsLoading: false,
  isStreaming: false,
  currentStreamText: '',
  currentSources: [],
  currentConfidence: null,
  conversationId: null,
  activeError: null,
  conversationSort: 'updated',

  addUserMessage: (content) => {
    set((s) => ({
      messages: [...s.messages, {
        id: `msg-${++messageCounter}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      }],
    }))
  },

  setMessages: (messages) => set({ messages, currentStreamText: '', currentSources: [], currentConfidence: null, isStreaming: false }),

  setConversations: (conversations) => set({ conversations }),

  setConversationsLoading: (loading) => set({ conversationsLoading: loading }),

  startStreaming: () => set({
    isStreaming: true,
    currentStreamText: '',
    currentSources: [],
    currentConfidence: null,
    activeError: null,
  }),

  appendStreamChunk: (text) => set((s) => ({
    currentStreamText: s.currentStreamText + text,
  })),

  setSources: (sources) => set({ currentSources: sources }),

  setConfidence: (confidence) => set({ currentConfidence: confidence }),

  finishStreaming: (profile, queryId?) => {
    const state = get()
    set((s) => ({
      messages: [...s.messages, {
        id: `msg-${++messageCounter}`,
        role: 'assistant',
        content: state.currentStreamText,
        sources: state.currentSources,
        confidence: state.currentConfidence || undefined,
        profile,
        queryId,
        timestamp: Date.now(),
      }],
      isStreaming: false,
      currentStreamText: '',
      currentSources: [],
      currentConfidence: null,
    }))
  },

  failStreaming: (message, profile) => {
    const state = get()
    set((s) => ({
      messages: [...s.messages, {
        id: `msg-${++messageCounter}`,
        role: 'assistant',
        content: state.currentStreamText || message,
        sources: state.currentSources,
        confidence: state.currentConfidence || undefined,
        profile,
        timestamp: Date.now(),
      }],
      isStreaming: false,
      currentStreamText: '',
      currentSources: [],
      currentConfidence: null,
      activeError: message,
    }))
  },

  setConversationId: (id) => set({ conversationId: id }),

  setConversationSort: (sort) => set({ conversationSort: sort }),

  clearMessages: () => set({
    messages: [],
    isStreaming: false,
    currentStreamText: '',
    currentSources: [],
    currentConfidence: null,
    conversationId: null,
    activeError: null,
  }),

  setActiveError: (message) => set({ activeError: message }),
}))
