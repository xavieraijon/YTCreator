import { type ChannelOrigin, CONNECTION_KINDS, type ConnectionKind, type JourneyStep, stepsOf } from '@ytcreator/core'
import type { OnboardingState } from '@ytcreator/core/api'
import { useEffect, useSyncExternalStore } from 'react'

export const WIZARD_STEPS = ['elegir', 'conectar', 'limites', 'listo'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

// Clean routes of contracts/ui-screens.md (R19); the server answers index.html for any non-API path.
export type Route =
  | { readonly page: 'root' }
  | { readonly page: 'welcome' }
  | { readonly page: 'wizard'; readonly step: WizardStep }
  | { readonly page: 'connectAi' }
  | { readonly page: 'home' }
  | { readonly page: 'channelStart' }
  | { readonly page: 'ideaBank' }
  | { readonly page: 'scriptList' }
  | { readonly page: 'script'; readonly id: string }
  | { readonly page: 'scriptVoice' }
  | { readonly page: 'packageList' }
  | { readonly page: 'package'; readonly id: string }
  | { readonly page: 'publishSettings' }
  | { readonly page: 'channelStep'; readonly kind: ChannelOrigin; readonly step: JourneyStep }
  | { readonly page: 'settings' }
  | { readonly page: 'aiSettings' }
  // limits: the connection is already there and only the spending limits are missing (no form to fill in again).
  | { readonly page: 'switchAi'; readonly kind: ConnectionKind; readonly limits?: true }
  | { readonly page: 'generalSettings' }
  | { readonly page: 'youtubeSettings' }
  | { readonly page: 'usageSettings' }
  | { readonly page: 'notFound' }

export type Target = Exclude<Route, { page: 'notFound' }>

const isStep = (value: string): value is WizardStep => (WIZARD_STEPS as readonly string[]).includes(value)
const KIND_BY_SEGMENT: Readonly<Record<string, ChannelOrigin>> = { nuevo: 'nuevo', existente: 'existente' }
const isJourneyStep = (kind: ChannelOrigin, value: string): value is JourneyStep =>
  (stepsOf(kind) as readonly string[]).includes(value)
const isKind = (value: string): value is ConnectionKind => (CONNECTION_KINDS as readonly string[]).includes(value)

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  const [first, second, third, fourth, fifth, ...rest] = parts
  if (rest.length) return { page: 'notFound' }
  if (!first) return { page: 'root' }
  if (first === 'bienvenida') {
    if (!second) return { page: 'welcome' }
    if (isStep(second) && !third) return { page: 'wizard', step: second }
  }
  if (first === 'conectar-ia' && !second) return { page: 'connectAi' }
  if (first === 'inicio' && !second) return { page: 'home' }
  if (first === 'canal') {
    if (!second) return { page: 'channelStart' }
    if (second === 'ideas' && !third) return { page: 'ideaBank' }
    if (second === 'guiones' && !third) return { page: 'scriptList' }
    if (second === 'guiones' && third === 'voz' && !fourth) return { page: 'scriptVoice' }
    if (second === 'guiones' && third && !fourth) return { page: 'script', id: third }
    if (second === 'publicaciones' && !third) return { page: 'packageList' }
    if (second === 'publicaciones' && third === 'ajustes' && !fourth) return { page: 'publishSettings' }
    // `ajustes` is kept for the publishing settings (US2): it is never the id of a package.
    if (second === 'publicaciones' && third && third !== 'ajustes' && !fourth) return { page: 'package', id: third }
    const kind = KIND_BY_SEGMENT[second]
    if (kind && third && !fourth && isJourneyStep(kind, third)) return { page: 'channelStep', kind, step: third }
  }
  if (first === 'ajustes') {
    if (!second) return { page: 'settings' }
    if (second === 'general' && !third) return { page: 'generalSettings' }
    if (second === 'youtube' && !third) return { page: 'youtubeSettings' }
    if (second === 'consumo' && !third) return { page: 'usageSettings' }
    if (second === 'ia' && !third) return { page: 'aiSettings' }
    if (second === 'ia' && third === 'cambiar' && fourth && isKind(fourth)) {
      if (!fifth) return { page: 'switchAi', kind: fourth }
      if (fifth === 'limites') return { page: 'switchAi', kind: fourth, limits: true }
    }
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
    case 'channelStart':
      return '/canal'
    case 'ideaBank':
      return '/canal/ideas'
    case 'scriptList':
      return '/canal/guiones'
    case 'scriptVoice':
      return '/canal/guiones/voz'
    case 'script':
      return `/canal/guiones/${encodeURIComponent(route.id)}`
    case 'packageList':
      return '/canal/publicaciones'
    case 'package':
      return `/canal/publicaciones/${encodeURIComponent(route.id)}`
    case 'publishSettings':
      return '/canal/publicaciones/ajustes'
    case 'channelStep':
      return `/canal/${route.kind}/${route.step}`
    case 'settings':
      return '/ajustes'
    case 'aiSettings':
      return '/ajustes/ia'
    case 'switchAi':
      return `/ajustes/ia/cambiar/${route.kind}${route.limits ? '/limites' : ''}`
    case 'generalSettings':
      return '/ajustes/general'
    case 'youtubeSettings':
      return '/ajustes/youtube'
    case 'usageSettings':
      return '/ajustes/consumo'
  }
}

// Where the server state says the creator is (contracts/ui-screens.md, «Redirección»).
export function onboardingTarget(state: OnboardingState): Target {
  if (state.completedAt) return { page: 'home' }
  if (state.postponed) return { page: 'connectAi' }
  if (state.step === 'bienvenida') return { page: 'welcome' }
  if (state.step === 'completado') return { page: 'home' }
  return { page: 'wizard', step: state.step }
}

// `/`, the wizard routes and /conectar-ia always follow the server: going by hand to another step goes back to the
// real one. The rest of the app (home, settings) is reachable whatever the state.
export function onboardingRedirect(route: Route, state: OnboardingState): Target | null {
  const guarded =
    route.page === 'root' || route.page === 'welcome' || route.page === 'wizard' || route.page === 'connectAi'
  if (!guarded) return null
  const target = onboardingTarget(state)
  return href(target) === (route.page === 'root' ? null : href(route)) ? null : target
}

// pushState fires no event, so navigate() notifies the subscribers itself.
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

// Something not saved on screen (novice audit 003, M4): leaving asks first, inside the app, with the browser's back
// arrow and when closing the tab.
let leaveMessage: string | null = null
let guardedPath: string | null = null

export function useLeaveGuard(message: string | null): void {
  useEffect(() => {
    if (message === null) return
    leaveMessage = message
    guardedPath = window.location.pathname
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      if (leaveMessage === message) {
        leaveMessage = null
        guardedPath = null
      }
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [message])
}

export function navigate(route: Target, { replace = false }: { replace?: boolean } = {}): void {
  const url = href(route)
  if (url === window.location.pathname) return
  if (leaveMessage !== null) {
    if (!window.confirm(leaveMessage)) return
    leaveMessage = null
    guardedPath = null
  }
  if (replace) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
  notify()
}

// The back and forward arrows: with something not saved, the browser has already moved, so declining puts the page
// back where it was. One listener for all the subscribers, so the question is asked once.
const onPopState = () => {
  if (leaveMessage !== null && guardedPath !== null && window.location.pathname !== guardedPath) {
    if (!window.confirm(leaveMessage)) {
      window.history.pushState(null, '', guardedPath)
      return
    }
    leaveMessage = null
    guardedPath = null
  }
  notify()
}

const subscribe = (onChange: () => void) => {
  if (listeners.size === 0) window.addEventListener('popstate', onPopState)
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
    if (listeners.size === 0) window.removeEventListener('popstate', onPopState)
  }
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

export function useRoute(): Route {
  return parseRoute(usePathname())
}
