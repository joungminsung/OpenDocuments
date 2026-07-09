import { useState } from 'react'
import { GitBranch, KeyRound, Lock, ShieldCheck } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { translate as tr } from '../../lib/i18n'

interface Props {
  onLogin: (apiKey: string) => void
  errorMessage?: string
}

export function LoginPage({ onLogin, errorMessage }: Props) {
  const { locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)
  const [key, setKey] = useState('')

  const submit = () => {
    const trimmed = key.trim()
    if (trimmed) onLogin(trimmed)
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
      <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-6xl items-center gap-10 lg:grid-cols-[1fr_420px]">
        <section>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-100 bg-white text-blue-600 shadow-sm">
            <ShieldCheck size={25} strokeWidth={2.1} />
          </div>
          <h1 className="mt-6 max-w-2xl text-[38px] font-semibold leading-tight tracking-[-0.015em]">
            {t('login.headline')}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-slate-500">
            {t('login.subtitle')}
          </p>
          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            {[
              [t('login.workspaceScoped'), t('login.workspaceScopedDesc')],
              [t('login.apiProtected'), t('login.apiProtectedDesc')],
              [t('login.selfHosted'), t('login.selfHostedDesc')],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <Lock size={16} className="text-slate-400" />
                <p className="mt-3 text-[13px] font-semibold text-slate-900">{title}</p>
                <p className="mt-1 text-[12px] leading-4 text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <KeyRound size={18} />
            </div>
            <div>
              <h2 className="text-[18px] font-semibold">{t('login.apiKeySignIn')}</h2>
              <p className="mt-0.5 text-[13px] text-slate-500">{t('login.apiKeyHelp')}</p>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] leading-5 text-red-700">
              {errorMessage}
            </div>
          )}

          <label className="mt-5 block">
            <span className="text-[12px] font-semibold text-slate-600">{t('login.apiKey')}</span>
            <input
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="od_live_..."
              className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-[14px] outline-none focus:border-blue-300"
              onKeyDown={(event) => {
                if (event.key === 'Enter') submit()
              }}
            />
          </label>

          <button
            onClick={submit}
            disabled={!key.trim()}
            className="mt-4 h-10 w-full rounded-md bg-blue-600 text-[14px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('login.signIn')}
          </button>

          <div className="mt-6 grid gap-2">
            <a href="/auth/login/google" className="flex h-10 items-center justify-center rounded-md border border-slate-200 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
              {t('login.google')}
            </a>
            <a href="/auth/login/github" className="flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 text-[13px] font-medium text-slate-700 hover:bg-slate-50">
              <GitBranch size={15} />
              {t('login.github')}
            </a>
          </div>

          <p className="mt-5 text-[12px] leading-5 text-slate-400">
            {t('login.help')}
          </p>
        </section>
      </div>
    </div>
  )
}
