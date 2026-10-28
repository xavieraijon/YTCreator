import { CONNECTION_KINDS, type ConnectionKind } from '@ytcreator/core'
import { useSyncExternalStore } from 'react'

export const WIZARD_STEPS = ['elegir', 'conectar', 'limites', 'listo'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

// Clean routes of contracts/ui-screens.md (R19); the server answers index.html for any non-API path.
export type Route =
  | { readonly page: 'root' }
  | { readonly page: 'welcome' }
  | { readonly page: 'wizard'; readonly step: WizardStep }
  | { readonly page: 'connectAi' }
  | { readonly page: 'home' }
  | { readonly page: 'settings' }
  | { readonly page: 'aiSettings' }
  | { readonly page: 'switchAi'; readonly kind: ConnectionKind }
  | { readonly page: 'generalSettings' }
  | { readonly page: 'notFound' }

export type Target = Exclude<Route, { page: 'notFound' }>

const isStep = (value: string): value is WizardStep => (WIZARD_STEPS as readonly string[]).includes(value)
const isKind = (value: string): value is ConnectionKind => (CONNECTION_KINDS as readonly string[]).includes(value)

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  const [first, second, third, fourth, ...rest] = parts
  if (rest.length) return { page: 'notFound' }
  if (!first) return { page: 'root' }
  if (first === 'bienvenida') {
    if (!second) return { page: 'welcome' }
    if (isStep(second) && !third) return { page: 'wizard', step: second }
  }
  if (first === 'conectar-ia' && !second) return { page: 'connectAi' }
  if (first === 'inicio' && !second) return { page: 'home' }
  if (first === 'ajustes') {
    if (!second) return { page: 'settings' }
    if (second === 'general' && !third) return { page: 'generalSettings' }
    if (second === 'ia' && !third) return { page: 'aiSettings' }
    if (second === 'ia' && third === 'cambiar' && fourth && isKind(fourth)) return { page: 'switchAi', kind: fourth }
  }
  return { page: 'notFound' }
}

export function href(route: Target): string {
  switch (route.page) {
    case 'root':
      return '/'
    case 'welcome':
      return '/bienvenida'
    case 'wizard':
      return `/bienvenida/${route.step}`
    case 'connectAi':
      return '/conectar-ia'
    case 'home':
      return '/inicio'
    case 'settings':
      return '/ajustes'
    case 'aiSettings':
      return '/ajustes/ia'
    case 'switchAi':
      return `/ajustes/ia/cambiar/${route.kind}`
    case 'generalSettings':
      return '/ajustes/general'
  }
}

// pushState fires no event, so navigate() notifies the subscribers itself.
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

export function navigate(route: Target, { replace = false }: { replace?: boolean } = {}): void {
  const url = href(route)
  if (url === window.location.pathname) return
  if (replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  notify()
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  window.addEventListener('popstate', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('popstate', onChange)
  }
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

export function useRoute(): Route {
  return parseRoute(usePathname())
}
