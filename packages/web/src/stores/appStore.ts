import { create } from 'zustand'
import type { RAGProfile } from '../lib/types'

type Theme = 'light' | 'dark' | 'system'
type Page = 'chat' | 'documents' | 'settings' | 'health' | 'connectors' | 'plugins' | 'workspaces'

interface AppState {
  theme: Theme
  effectiveTheme: 'light' | 'dark'
  profile: RAGProfile
  currentPage: Page
  sidebarOpen: boolean

  setTheme: (theme: Theme) => void
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
  profile: (localStorage.getItem('opendocuments-profile') as RAGProfile) || 'balanced',
  currentPage: 'chat',
  sidebarOpen: true,

  setTheme: (theme) => {
    localStorage.setItem('opendocuments-theme', theme)
    const effective = getEffectiveTheme(theme)
    document.documentElement.classList.toggle('dark', effective === 'dark')
    set({ theme, effectiveTheme: effective })
  },

  setProfile: (profile) => {
    localStorage.setItem('opendocuments-profile', profile)
    set({ profile })
  },

  setPage: (page) => set({ currentPage: page }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))
