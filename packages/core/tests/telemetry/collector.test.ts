import { TelemetryCollector } from '../../src/telemetry/collector.js'

describe('TelemetryCollector', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stays disabled when no endpoint is configured', () => {
    const collector = new TelemetryCollector({ enabled: true })
    expect(collector.isEnabled()).toBe(false)
  })

  it('flushes queued events to the configured endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const collector = new TelemetryCollector({
      enabled: true,
      endpoint: 'https://telemetry.example/events',
    })
    collector.track('document:indexed', { chunks: 3 })
    await collector.flush()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://telemetry.example/events',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.events[0].event).toBe('document:indexed')
    expect(body.events[0].properties.chunks).toBe(3)
  })
})
