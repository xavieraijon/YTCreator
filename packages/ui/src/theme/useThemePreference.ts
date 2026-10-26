import { useCallback, useSyncExternalStore } from 'react'
import { themeStorageKey } from './init-script.ts'

export type ThemePreference = 'auto' | 'light' | 'dark'

const listeners = new Set<() => void>()
let current: ThemePreference | undefined

/** An unknown value or a storage error both mean `auto` (data-model.md, «ThemePreference»). */
function readStored(): ThemePreference {
  try {
    const value = localStorage.getItem(themeStorageKey)
    return value === 'light' || value === 'dark' ? value : 'auto'
  } catch {
    return 'auto'
  }
}

function writeStored(preference: ThemePreference) {
  try {
    if (preference === 'auto') localStorage.removeItem(themeStorageKey)
    else localStorage.setItem(themeStorageKey, preference)
  } catch {
    // Blocked storage: the choice still applies to this visit.
  }
}

function getSnapshot(): ThemePreference {
  current ??= readStored()
  return current
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function apply(preference: ThemePreference) {
  const root = document.documentElement
  // Transitions stay off for one frame so every surface switches theme at once.
  root.dataset.themeSwitching = ''
  if (preference === 'auto') delete root.dataset.theme
  else root.dataset.theme = preference
  requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.themeSwitching))
}

export function useThemePreference(): {
  preference: ThemePreference
  setPreference(preference: ThemePreference): void
} {
  const preference = useSyncExternalStore(subscribe, getSnapshot, () => 'auto' as const)
  const setPreference = useCallback((next: ThemePreference) => {
    current = next
    writeStored(next)
    apply(next)
    for (const listener of listeners) listener()
  }, [])
  return { preference, setPreference }
}
