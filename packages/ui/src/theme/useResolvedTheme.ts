import { useSyncExternalStore } from 'react'

const darkQuery = '(prefers-color-scheme: dark)'

function getSnapshot(): 'light' | 'dark' {
  const theme = document.documentElement.dataset.theme
  if (theme === 'light' || theme === 'dark') return theme
  return matchMedia(darkQuery).matches ? 'dark' : 'light'
}

function subscribe(listener: () => void) {
  const media = matchMedia(darkQuery)
  media.addEventListener('change', listener)
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributeFilter: ['data-theme'] })
  return () => {
    media.removeEventListener('change', listener)
    observer.disconnect()
  }
}

/** Theme actually on screen: the stored choice, or the system one in `auto`. */
export function useResolvedTheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribe, getSnapshot, () => 'light' as const)
}
