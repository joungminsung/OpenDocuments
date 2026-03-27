import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../stores/appStore'

const COMMANDS = [
  { id: 'chat', label: 'Go to Chat', shortcut: '⌘1', action: 'setPage' as const, value: 'chat' },
  { id: 'docs', label: 'Go to Documents', shortcut: '⌘2', action: 'setPage' as const, value: 'documents' },
  { id: 'connectors', label: 'Go to Connectors', shortcut: '⌘3', action: 'setPage' as const, value: 'connectors' },
  { id: 'settings', label: 'Go to Settings', shortcut: '⌘4', action: 'setPage' as const, value: 'settings' },
  { id: 'admin', label: 'Go to Admin', shortcut: '⌘5', action: 'setPage' as const, value: 'health' },
  { id: 'theme-light', label: 'Switch to Light Theme', action: 'setTheme' as const, value: 'light' },
  { id: 'theme-dark', label: 'Switch to Dark Theme', action: 'setTheme' as const, value: 'dark' },
  { id: 'profile-fast', label: 'Set Profile: Fast', action: 'setProfile' as const, value: 'fast' },
  { id: 'profile-balanced', label: 'Set Profile: Balanced', action: 'setProfile' as const, value: 'balanced' },
  { id: 'profile-precise', label: 'Set Profile: Precise', action: 'setProfile' as const, value: 'precise' },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const { setPage, setTheme, setProfile } = useAppStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)

      // Number shortcuts
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '5') {
        e.preventDefault()
        const pages = ['chat', 'documents', 'connectors', 'settings', 'health'] as const
        setPage(pages[parseInt(e.key) - 1])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setPage])

  useEffect(() => {
    if (open) { setQuery(''); inputRef.current?.focus() }
  }, [open])

  const filtered = COMMANDS.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))

  const execute = (cmd: typeof COMMANDS[0]) => {
    if (cmd.action === 'setPage') setPage(cmd.value as any)
    else if (cmd.action === 'setTheme') setTheme(cmd.value as any)
    else if (cmd.action === 'setProfile') setProfile(cmd.value as any)
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
          placeholder="Type a command..."
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
              <span>{cmd.label}</span>
              {cmd.shortcut && <span className="text-xs text-gray-400">{cmd.shortcut}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
