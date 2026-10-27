import { useSyncExternalStore } from 'react'

export const foundationCategories = [
  'color',
  'tipografia',
  'espaciado',
  'radios',
  'elevacion',
  'cristal',
  'bordes',
  'capas',
  'movimiento',
  'puntos-de-ruptura',
  'iconos',
] as const

export type FoundationCategory = (typeof foundationCategories)[number]

export type Route =
  | { readonly page: 'home' }
  | { readonly page: 'foundation'; readonly category: FoundationCategory }
  | { readonly page: 'component'; readonly id: string }
  | { readonly page: 'sample' }
  | { readonly page: 'not-found' }

const isCategory = (value: string): value is FoundationCategory =>
  (foundationCategories as readonly string[]).includes(value)

/** Hash routes of contracts/catalog.md. `#/` (or no hash) is the home page. */
export function parseRoute(hash: string): Route {
  const [section, param, ...rest] = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (rest.length) return { page: 'not-found' }
  if (!section) return { page: 'home' }
  if (section === 'muestra' && !param) return { page: 'sample' }
  if (section === 'fundamentos' && param && isCategory(param)) return { page: 'foundation', category: param }
  if (section === 'componentes' && param) return { page: 'component', id: param }
  return { page: 'not-found' }
}

export function href(route: Exclude<Route, { page: 'not-found' }>): string {
  switch (route.page) {
    case 'home':
      return '#/'
    case 'foundation':
      return `#/fundamentos/${route.category}`
    case 'component':
      return `#/componentes/${route.id}`
    case 'sample':
      return '#/muestra'
  }
}

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return parseRoute(hash)
}
