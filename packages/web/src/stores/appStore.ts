import { create } from 'zustand'
import type { RAGProfile } from '../lib/types'
import { detectLocale, normalizeLocale, type Locale } from '../lib/i18n'

export type Theme = 'light' | 'dark' | 'system'
export type Page = 'dashboard' | 'chat' | 'documents' | 'collections' | 'settings' | 'health' | 'connectors' | 'plugins' | 'workspaces'

interface AppState {
  theme: Theme
  effectiveTheme: 'light' | 'dark'
  locale: Locale
  profile: RAGProfile
  currentPage: Page
  sidebarOpen: boolean

  setTheme: (theme: Theme) => void
  setLocale: (locale: Locale) => void
  setProfile: (profile: RAGProfile) => void
  setPage: (page: Page) => void
  toggleSidebar: () => void
}

function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export const useAppStore = create<AppState>((set) => ({
  theme: (localStorage.getItem('opendocuments-theme') as Theme) || 'system',
  effectiveTheme: getEffectiveTheme(
    (localStorage.getItem('opendocuments-theme') as Theme) || 'system'
  ),
  locale: localStorage.getItem('opendocuments-locale')
    ? normalizeLocale(localStorage.getItem('opendocuments-locale'))
    : detectLocale(),
  profile: (localStorage.getItem('opendocuments-profile') as RAGProfile) || 'fast',
  currentPage: 'chat',
  sidebarOpen: true,

  setTheme: (theme) => {
    localStorage.setItem('opendocuments-theme', theme)
    const effective = getEffectiveTheme(theme)
    document.documentElement.classList.toggle('dark', effective === 'dark')
    set({ theme, effectiveTheme: effective })
  },

  setLocale: (locale) => {
    localStorage.setItem('opendocuments-locale', locale)
    document.documentElement.lang = locale
    set({ locale })
  },

  setProfile: (profile) => {
    localStorage.setItem('opendocuments-profile', profile)
    set({ profile })
  },

  setPage: (page) => set({ currentPage: page }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))
