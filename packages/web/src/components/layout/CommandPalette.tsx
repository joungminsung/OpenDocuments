import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../stores/appStore'
import type { Page, Theme } from '../../stores/appStore'
import type { RAGProfile } from '../../lib/types'
import { translate as tr } from '../../lib/i18n'

type Command =
  | { id: string; labelKey: string; shortcut?: string; action: 'setPage'; value: Page }
  | { id: string; labelKey: string; shortcut?: string; action: 'setTheme'; value: Theme }
  | { id: string; labelKey: string; shortcut?: string; action: 'setProfile'; value: RAGProfile }

const COMMANDS: Command[] = [
  { id: 'chat', labelKey: 'command.goChat', shortcut: '⌘1', action: 'setPage' as const, value: 'chat' },
  { id: 'docs', labelKey: 'command.goDocuments', shortcut: '⌘2', action: 'setPage' as const, value: 'documents' },
  { id: 'collections', labelKey: 'command.goCollections', shortcut: '⌘3', action: 'setPage' as const, value: 'collections' },
  { id: 'connectors', labelKey: 'command.goConnections', shortcut: '⌘4', action: 'setPage' as const, value: 'connectors' },
  { id: 'activity', labelKey: 'command.goActivity', shortcut: '⌘5', action: 'setPage' as const, value: 'health' },
  { id: 'settings', labelKey: 'command.goSettings', shortcut: '⌘6', action: 'setPage' as const, value: 'settings' },
  { id: 'theme-light', labelKey: 'command.lightTheme', action: 'setTheme' as const, value: 'light' },
  { id: 'theme-dark', labelKey: 'command.darkTheme', action: 'setTheme' as const, value: 'dark' },
  { id: 'profile-fast', labelKey: 'command.profileFast', action: 'setProfile' as const, value: 'fast' },
  { id: 'profile-balanced', labelKey: 'command.profileBalanced', action: 'setProfile' as const, value: 'balanced' },
  { id: 'profile-precise', labelKey: 'command.profilePrecise', action: 'setProfile' as const, value: 'precise' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { setPage, setTheme, setProfile, locale } = useAppStore()
  const t = (key: string, values?: Record<string, string | number>) => tr(locale, key, values)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)

      // Number shortcuts
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '6') {
        e.preventDefault()
        const pages: Page[] = ['chat', 'documents', 'collections', 'connectors', 'health', 'settings']
        setPage(pages[parseInt(e.key) - 1])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setPage])

  useEffect(() => {
    if (open) { setQuery(''); inputRef.current?.focus() }
  }, [open])

  const filtered = COMMANDS.filter(c => t(c.labelKey).toLowerCase().includes(query.toLowerCase()))

  const execute = (cmd: Command) => {
    if (cmd.action === 'setPage') setPage(cmd.value)
    else if (cmd.action === 'setTheme') setTheme(cmd.value)
    else setProfile(cmd.value)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('command.placeholder')}
          className="w-full px-4 py-3 bg-transparent border-b border-gray-200 dark:border-gray-800 text-sm focus:outline-none"
          onKeyDown={e => {
            if (e.key === 'Enter' && filtered.length > 0) execute(filtered[0])
          }}
        />
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.map(cmd => (
            <button
              key={cmd.id}
              onClick={() => execute(cmd)}
              className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
            >
              <span>{t(cmd.labelKey)}</span>
              {cmd.shortcut && <span className="text-xs text-gray-400">{cmd.shortcut}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
