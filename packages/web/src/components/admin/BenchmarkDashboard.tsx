import { useState, useEffect } from 'react'
import { getModelBenchmarks } from '../../lib/api.js'

type BenchmarkEntry = {
  name: string
  version: string
  capabilities: Record<string, boolean | undefined>
  health: { healthy: boolean; message?: string } | null
  generation: { latencyMs: number; tokensPerSec: number } | { error: string } | null
  embedding: { latencyMs: number; textsPerSec: number } | { error: string } | null
}

function hasError(val: unknown): val is { error: string } {
  return typeof val === 'object' && val !== null && 'error' in val
}

function HealthDot({ health }: { health: BenchmarkEntry['health'] }) {
  if (!health) return <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" title="No health check" />
  return (
    <span
      className={`w-2.5 h-2.5 rounded-full inline-block ${health.healthy ? 'bg-green-500' : 'bg-red-500'}`}
      title={health.message ?? (health.healthy ? 'Healthy' : 'Unhealthy')}
    />
  )
}

function MetricCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="text-right">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  )
}

function ErrorCell({ label, message }: { label: string; message: string }) {
  return (
    <div className="text-right">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p className="text-xs text-red-500 dark:text-red-400 truncate max-w-[140px]" title={message}>Error</p>
    </div>
  )
}

function CapabilityBadges({ capabilities }: { capabilities: Record<string, boolean | undefined> }) {
  const active = Object.entries(capabilities)
    .filter(([, v]) => v)
    .map(([k]) => k)
  if (active.length === 0) return null
  return (
    <div className="flex gap-1 mt-1 flex-wrap">
      {active.map(cap => (
        <span
          key={cap}
          className="text-[10px] px-1.5 py-0.5 rounded bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 font-medium uppercase tracking-wide"
        >
          {cap}
        </span>
      ))}
    </div>
  )
}

export function BenchmarkDashboard() {
  const [benchmarks, setBenchmarks] = useState<BenchmarkEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const runBenchmark = () => {
    setLoading(true)
    setError('')
    getModelBenchmarks()
      .then(res => setBenchmarks(res.benchmarks))
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    runBenchmark()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Model Benchmarks</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Live generation and embedding speed for all registered models</p>
        </div>
        <button
          onClick={runBenchmark}
          disabled={loading}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
        >
          {loading ? 'Running...' : 'Run Benchmark'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-600 dark:text-red-400">Error: {error}</p>
        </div>
      )}

      {loading && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">Running benchmarks, this may take a moment...</p>
        </div>
      )}

      {!loading && !error && benchmarks.length === 0 && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">No model plugins registered.</p>
        </div>
      )}

      {!loading && benchmarks.length > 0 && (
        <div className="space-y-3">
          {benchmarks.map(entry => (
            <div
              key={entry.name}
              className="bg-gray-50 dark:bg-gray-800/50 rounded-xl px-4 py-4 flex items-start justify-between gap-4"
            >
              {/* Left: identity */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <HealthDot health={entry.health} />
                  <p className="text-sm font-mono font-medium text-gray-800 dark:text-gray-100 truncate">{entry.name}</p>
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">v{entry.version}</span>
                </div>
                <CapabilityBadges capabilities={entry.capabilities} />
                {entry.health && !entry.health.healthy && entry.health.message && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1 truncate" title={entry.health.message}>
                    {entry.health.message}
                  </p>
                )}
              </div>

              {/* Right: metrics */}
              <div className="flex gap-6 shrink-0">
                {/* Generation */}
                {entry.generation !== null ? (
                  hasError(entry.generation) ? (
                    <ErrorCell label="Generation" message={entry.generation.error} />
                  ) : (
                    <MetricCell
                      label="Generation"
                      value={`${entry.generation.tokensPerSec} tok/s`}
                      sub={`${entry.generation.latencyMs} ms`}
                    />
                  )
                ) : (
                  <div className="text-right">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Generation</p>
                    <p className="text-xs text-gray-300 dark:text-gray-600">N/A</p>
                  </div>
                )}

                {/* Embedding */}
                {entry.embedding !== null ? (
                  hasError(entry.embedding) ? (
                    <ErrorCell label="Embedding" message={entry.embedding.error} />
                  ) : (
                    <MetricCell
                      label="Embedding"
                      value={`${entry.embedding.textsPerSec} texts/s`}
                      sub={`${entry.embedding.latencyMs} ms`}
                    />
                  )
                ) : (
                  <div className="text-right">
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">Embedding</p>
                    <p className="text-xs text-gray-300 dark:text-gray-600">N/A</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
