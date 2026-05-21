// packages/core/src/events/webhook-dispatcher.ts
import { createHmac } from 'node:crypto'
import type { EventBus, EventName, OpenDocumentsEventMap } from './bus.js'

/** Configuration for a single webhook endpoint. */
export interface WebhookConfig {
  /** Target URL to POST events to. */
  url: string
  /** List of event names this webhook subscribes to. */
  events: string[]
  /** Optional HMAC-SHA256 secret for request signing. */
  secret?: string
  /** Number of retry attempts on 5xx errors. Default: 2. */
  retries?: number
}

/**
 * Dispatches EventBus events to configured HTTP webhook endpoints.
 *
 * Each matching webhook receives a POST request with a JSON payload
 * containing `{ event, data, timestamp }`. If a `secret` is configured,
 * an `X-Webhook-Signature: sha256=<hmac>` header is added. Retries
 * are performed with exponential backoff on HTTP 500+ responses.
 */
export class WebhookDispatcher {
  private readonly eventBus: EventBus
  private readonly webhooks: WebhookConfig[]
  /** Map of event name -> bound handler, for cleanup in destroy(). */
  private readonly handlers = new Map<EventName, (data: unknown) => void>()

  constructor(eventBus: EventBus, webhooks: WebhookConfig[]) {
    this.eventBus = eventBus
    this.webhooks = webhooks

    // Collect unique event names across all webhook configs
    const uniqueEvents = new Set<string>()
    for (const wh of webhooks) {
      for (const ev of wh.events) {
        uniqueEvents.add(ev)
      }
    }

    // Register one handler per unique event name
    for (const event of uniqueEvents) {
      const handler = (data: unknown) => {
        void this.dispatch(event, data)
      }
      this.handlers.set(event as EventName, handler)
      this.eventBus.on(event as EventName, handler as (data: OpenDocumentsEventMap[EventName]) => void)
    }
  }

  /**
   * Sends the event to all matching webhook endpoints.
   * Retries on HTTP 500+ errors; does NOT retry on 4xx.
   */
  async dispatch(event: string, data: unknown): Promise<void> {
    const timestamp = new Date().toISOString()
    const payload = JSON.stringify({ event, data, timestamp })

    for (const wh of this.webhooks) {
      if (!wh.events.includes(event)) continue

      const retries = wh.retries ?? 2
      await this.sendWithRetry(wh, payload, retries)
    }
  }

  /** Removes all event listeners registered by this dispatcher. */
  destroy(): void {
    for (const [event, handler] of this.handlers) {
      this.eventBus.off(event, handler as (data: OpenDocumentsEventMap[EventName]) => void)
    }
    this.handlers.clear()
  }

  // ------------------------------------------------------------------ //
  //  Private helpers                                                     //
  // ------------------------------------------------------------------ //

  private async sendWithRetry(
    wh: WebhookConfig,
    payload: string,
    maxRetries: number,
    attempt = 1,
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (wh.secret) {
      const hmac = createHmac('sha256', wh.secret).update(payload).digest('hex')
      headers['X-Webhook-Signature'] = `sha256=${hmac}`
    }

    let response: Response
    try {
      response = await fetch(wh.url, {
        method: 'POST',
        headers,
        body: payload,
      })
    } catch {
      // Network-level failure — treat as retryable
      if (attempt <= maxRetries) {
        await this.sleep(1000 * attempt)
        return this.sendWithRetry(wh, payload, maxRetries, attempt + 1)
      }
      return
    }

    if (response.status >= 500) {
      if (attempt <= maxRetries) {
        await this.sleep(1000 * attempt)
        return this.sendWithRetry(wh, payload, maxRetries, attempt + 1)
      }
      // Exhausted retries — give up silently
      return
    }

    // 4xx: do not retry
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
