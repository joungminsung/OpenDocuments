// packages/core/src/events/bus.ts
import EventEmitter from 'eventemitter3'

type EventHandler = (...args: any[]) => void
type WildcardHandler = (event: string, ...args: any[]) => void

export class EventBus {
  private emitter = new EventEmitter()
  private wildcardListeners = new Set<WildcardHandler>()

  on(event: string, handler: EventHandler): void {
    this.emitter.on(event, handler)
  }

  off(event: string, handler: EventHandler): void {
    this.emitter.off(event, handler)
  }

  once(event: string, handler: EventHandler): void {
    this.emitter.once(event, handler)
  }

  emit(event: string, ...args: any[]): void {
    this.emitter.emit(event, ...args)
    for (const handler of this.wildcardListeners) {
      handler(event, ...args)
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
