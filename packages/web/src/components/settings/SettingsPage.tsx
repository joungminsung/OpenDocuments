import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, Monitor, Moon, RefreshCw, Server, Sun } from 'lucide-react'
import { getHealth, getModelBenchmarks, getWorkbench } from '../../lib/api'
import { useAppStore } from '../../stores/appStore'
import type { RAGProfile, WorkbenchResponse } from '../../lib/types'
import { translate as tr } from '../../lib/i18n'

interface BenchmarkModel {
  name: string
  version: string
  capabilities: Record<string, boolean | undefined>
  health: { healthy: boolean; message?: string } | null
  generation: { latencyMs: number; tokensPerSec: number } | { error: string } | null
  embedding: { latencyMs: number; textsPerSec: number } | { error: string } | null
}

function SettingCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-[15px] font-semibold text-slate-950">{title}</h3>
      {description && <p className="mt-1 text-[13px] leading-5 text-slate-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1 break-words text-[13px] text-slate-800">{value}</div>
    </div>
  )
}

export function SettingsPage() {
  const { profile, setProfile, theme, setTheme, locale, setLocale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [health, setHealth] = useState<{ status: string; version: string } | null>(null)
  const [workbench, setWorkbench] = useState<WorkbenchResponse | null>(null)
  const [models, setModels] = useState<BenchmarkModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextHealth, nextWorkbench, modelData] = await Promise.all([
        getHealth(),
        getWorkbench(),
        getModelBenchmarks().catch(() => ({ benchmarks: [] as BenchmarkModel[] })),
      ])
      setHealth(nextHealth)
      setWorkbench(nextWorkbench)
      setModels(modelData.benchmarks)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.subtitle'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div className="min-h-full bg-slate-50 px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[13px] font-medium text-blue-600">{t('settings.eyebrow')}</p>
            <h2 className="mt-1 text-[26px] font-semibold tracking-normal">{t('settings.title')}</h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-500">
              {t('settings.subtitle')}
            </p>
          </div>
          <button
            onClick={() => void refresh()}
            className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw size={15} />
            {t('common.refresh')}
          </button>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white px-5 py-12 text-center text-[14px] text-slate-400 shadow-sm">
            {t('common.loading')}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            <SettingCard title={t('settings.appearance')} description={t('settings.appearanceDesc')}>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['system', Monitor],
                  ['light', Sun],
                  ['dark', Moon],
                ] as const).map(([value, Icon]) => (
                  <button
                    key={value}
                    onClick={() => setTheme(value)}
                    className={`flex h-10 items-center justify-center gap-2 rounded-md border text-[13px] font-medium capitalize ${
                      theme === value
                        ? 'border-blue-200 bg-blue-50 text-blue-600'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={15} />
                    {t(`settings.theme.${value}`)}
                  </button>
                ))}
              </div>
            </SettingCard>

            <SettingCard title={t('settings.language')} description={t('settings.languageDesc')}>
              <div className="grid grid-cols-2 gap-2">
                {(['en', 'ko'] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => setLocale(value)}
                    className={`h-10 rounded-md border text-[13px] font-medium ${
                      locale === value
                        ? 'border-blue-200 bg-blue-50 text-blue-600'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {t(`settings.language.${value}`)}
                  </button>
                ))}
              </div>
            </SettingCard>

            <SettingCard title={t('settings.ragProfile')} description={t('settings.ragProfileDesc')}>
              <div className="grid grid-cols-3 gap-2">
                {(['fast', 'balanced', 'precise'] as RAGProfile[]).map((value) => (
                  <button
                    key={value}
                    onClick={() => setProfile(value)}
                    className={`h-10 rounded-md border text-[13px] font-medium capitalize ${
                      profile === value
                        ? 'border-blue-200 bg-blue-50 text-blue-600'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {t(`settings.profile.${value}`)}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[12px] leading-5 text-slate-500">
                {profile === 'fast'
                  ? t('settings.profile.fastDesc')
                  : profile === 'balanced'
                    ? t('settings.profile.balancedDesc')
                    : t('settings.profile.preciseDesc')}
              </p>
            </SettingCard>

            <SettingCard title={t('settings.server')} description={t('settings.serverDesc')}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('common.status')} value={health?.status || t('common.unknown')} />
                <Field label={t('settings.version')} value={health?.version || t('common.unknown')} />
                <Field label={t('settings.workspace')} value={workbench?.workspace.name || t('common.unknown')} />
                <Field label={t('settings.mode')} value={workbench?.workspace.mode || t('common.unknown')} />
              </div>
            </SettingCard>

            <SettingCard title={t('settings.corpusReadiness')} description={t('settings.corpusReadinessDesc')}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('common.documents')} value={workbench?.corpus.documents ?? 0} />
                <Field label={t('common.chunks')} value={workbench?.corpus.chunks ?? 0} />
                <Field label={t('dashboard.connectors')} value={`${workbench?.connectors.active ?? 0}/${workbench?.connectors.total ?? 0} ${t('common.active')}`} />
                <Field label={t('settings.modelStatus')} value={workbench?.health.modelStatus || t('common.unknown')} />
              </div>
            </SettingCard>

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <div className="flex items-center gap-2">
                <Server size={17} className="text-slate-500" />
                <h3 className="text-[15px] font-semibold text-slate-950">{t('settings.modelProviders')}</h3>
              </div>
              {models.length === 0 ? (
                <p className="mt-4 text-[13px] text-slate-400">{t('settings.noModels')}</p>
              ) : (
                <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {models.map((model) => (
                    <div key={model.name} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_150px_150px]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[14px] font-semibold text-slate-900">{model.name}</p>
                          <CheckCircle2 size={14} className={model.health?.healthy ? 'text-emerald-500' : 'text-slate-300'} />
                        </div>
                        <p className="mt-1 text-[12px] text-slate-400">v{model.version} · {model.health?.message || t('common.notRecorded')}</p>
                      </div>
                      <p className="text-[12px] text-slate-500">
                        {t('settings.generation')}<br />
                        <span className="font-medium text-slate-800">
                          {model.generation && 'latencyMs' in model.generation ? `${model.generation.latencyMs}ms` : '-'}
                        </span>
                      </p>
                      <p className="text-[12px] text-slate-500">
                        {t('settings.embedding')}<br />
                        <span className="font-medium text-slate-800">
                          {model.embedding && 'latencyMs' in model.embedding ? `${model.embedding.latencyMs}ms` : '-'}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
