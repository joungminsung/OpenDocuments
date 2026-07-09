import { platform, arch } from 'node:os'
import { fetchWithTimeout } from '../utils/fetch.js'

export interface TelemetryEvent {
  event: string
  properties?: Record<string, string | number | boolean>
}

export class TelemetryCollector {
  private enabled: boolean
  private queue: TelemetryEvent[] = []
  private sessionId: string
  private endpoint?: string

  constructor(config?: { enabled?: boolean; endpoint?: string }) {
    this.endpoint = config?.endpoint
    this.enabled = Boolean(config?.enabled && this.endpoint)
    this.sessionId = Math.random().toString(36).substring(2)
  }

  track(event: string, properties?: Record<string, string | number | boolean>): void {
    if (!this.enabled) return
    this.queue.push({
      event,
      properties: {
        ...properties,
        os: platform(),
        arch: arch(),
        nodeVersion: process.version,
        sessionId: this.sessionId,
      },
    })
  }

  async flush(): Promise<void> {
    if (!this.enabled || !this.endpoint || this.queue.length === 0) return

    const events = [...this.queue]
    const res = await fetchWithTimeout(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    }, 5000)

    if (!res.ok) {
      throw new Error(`Telemetry endpoint returned HTTP ${res.status}`)
    }
    this.queue = []
  }

  isEnabled(): boolean {
    return this.enabled
  }
}
