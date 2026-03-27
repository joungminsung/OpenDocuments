import { platform, arch } from 'node:os'

export interface TelemetryEvent {
  event: string
  properties?: Record<string, string | number | boolean>
}

export class TelemetryCollector {
  private enabled: boolean
  private queue: TelemetryEvent[] = []
  private sessionId: string

  constructor(config?: { enabled?: boolean }) {
    this.enabled = config?.enabled ?? false
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
    if (!this.enabled || this.queue.length === 0) return

    // In a real implementation, this would send to a telemetry endpoint
    // For now, just clear the queue (opt-in but no endpoint configured)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const events = [...this.queue]
    this.queue = []

    // TODO: Send to telemetry endpoint when configured
    // try { await fetchWithTimeout('https://telemetry.opendocuments.dev/events', { method: 'POST', body: JSON.stringify(events) }) } catch {}
  }

  isEnabled(): boolean {
    return this.enabled
  }
}
