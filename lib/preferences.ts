export type Theme = 'light' | 'dark' | 'system'
export type Density = 'comfortable' | 'compact'

export type Preferences = {
  theme: Theme
  density: Density
  sidebarCollapsed: boolean
  idleMinutes: number
  revealSeconds: number
  clipboardSeconds: number
  remaskOnBlur: boolean
  language: 'fr'
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  density: 'comfortable',
  sidebarCollapsed: false,
  idleMinutes: 15,
  revealSeconds: 10,
  clipboardSeconds: 30,
  remaskOnBlur: false,
  language: 'fr',
}

const STORAGE_KEY = 'wasp-preferences'
let current: Preferences = DEFAULT_PREFERENCES
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function apply(preferences: Preferences) {
  if (typeof document === 'undefined') return
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark)
  document.documentElement.dataset.colorMode = dark ? 'dark' : 'light'
  document.documentElement.dataset.density = preferences.density
  document.documentElement.dataset.sidebar = preferences.sidebarCollapsed ? 'collapsed' : 'expanded'
}

export function loadPreferences() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    current = raw ? { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) } : DEFAULT_PREFERENCES
  } catch { current = DEFAULT_PREFERENCES }
  apply(current)
  emit()
}

export function savePreferences(patch: Partial<Preferences>) {
  current = { ...current, ...patch }
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  apply(current)
  emit()
}

export const preferencesStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  getSnapshot: () => current,
  getServerSnapshot: () => DEFAULT_PREFERENCES,
}
