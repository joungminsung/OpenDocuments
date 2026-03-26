// packages/core/tests/events/bus.test.ts
import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '../../src/events/bus.js'

describe('EventBus', () => {
  it('emits and receives events', () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.on('document:indexed', handler)
    bus.emit('document:indexed', { documentId: 'doc-1', chunks: 5 })

    expect(handler).toHaveBeenCalledWith({ documentId: 'doc-1', chunks: 5 })
  })

  it('supports wildcard listeners', () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.onAny(handler)
    bus.emit('document:indexed', { documentId: 'doc-1' })
    bus.emit('query:received', { query: 'test' })

    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenCalledWith('document:indexed', { documentId: 'doc-1' })
    expect(handler).toHaveBeenCalledWith('query:received', { query: 'test' })
  })

  it('removes listeners with off()', () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.on('document:indexed', handler)
    bus.off('document:indexed', handler)
    bus.emit('document:indexed', { documentId: 'doc-1' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('supports once() for single-fire listeners', () => {
    const bus = new EventBus()
    const handler = vi.fn()

    bus.once('server:started', handler)
    bus.emit('server:started', { port: 3000 })
    bus.emit('server:started', { port: 3000 })

    expect(handler).toHaveBeenCalledTimes(1)
  })
})
