// packages/core/src/events/bus.ts
import EventEmitter from 'eventemitter3'

// Typed event map matching spec section 3.11
export interface OpenDocumentsEventMap {
  // Document lifecycle
  'document:discovered': { documentId: string; source: string }
  'document:fetched': { documentId: string }
  'document:parsed': { documentId: string; chunks: number }
  'document:chunked': { documentId: string; chunks: number }
  'document:embedded': { documentId: string; chunks: number }
  'document:indexed': { documentId: string; chunks: number }
  'document:deleted': { documentId: string }
  'document:error': { documentId: string; error: string }

  // Query lifecycle
  'query:received': { queryId: string; query: string }
  'query:parsed': { queryId: string; intent: string }
  'query:retrieved': { queryId: string; chunks: number }
  'query:reranked': { queryId: string; chunks: number }
  'query:generated': { queryId: string }
  'query:feedback': { queryId: string; feedback: 'positive' | 'negative' }

  // System
  'connector:sync:started': { connectorId: string }
  'connector:sync:completed': { connectorId: string; documents: number }
  'plugin:loaded': { name: string; type: string }
  'plugin:error': { name: string; error: string }
  'server:started': { port: number }
}

export type EventName = keyof OpenDocumentsEventMap

type EventHandler<T = any> = (data: T) => void
type WildcardHandler = (event: string, data: unknown) => void

export class EventBus {
  private emitter = new EventEmitter()
  private wildcardListeners = new Set<WildcardHandler>()

  on<E extends EventName>(event: E, handler: EventHandler<OpenDocumentsEventMap[E]>): void {
    this.emitter.on(event, handler)
  }

  off<E extends EventName>(event: E, handler: EventHandler<OpenDocumentsEventMap[E]>): void {
    this.emitter.off(event, handler)
  }

  once<E extends EventName>(event: E, handler: EventHandler<OpenDocumentsEventMap[E]>): void {
    this.emitter.once(event, handler)
  }

  emit<E extends EventName>(event: E, data: OpenDocumentsEventMap[E]): void {
    this.emitter.emit(event, data)
    for (const handler of this.wildcardListeners) {
      handler(event, data)
    }
  }

  onAny(handler: WildcardHandler): void {
    this.wildcardListeners.add(handler)
  }

  offAny(handler: WildcardHandler): void {
    this.wildcardListeners.delete(handler)
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners()
    this.wildcardListeners.clear()
  }
}
