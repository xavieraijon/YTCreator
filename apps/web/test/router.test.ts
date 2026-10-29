import { describe, expect, it } from 'vitest'
import type { OnboardingState } from '@ytcreator/core/api'
import { href, onboardingRedirect, parseRoute, type Target } from '../src/router.ts'

const targets: Target[] = [
  { page: 'root' },
  { page: 'welcome' },
  { page: 'wizard', step: 'elegir' },
  { page: 'wizard', step: 'listo' },
  { page: 'connectAi' },
  { page: 'home' },
  { page: 'settings' },
  { page: 'aiSettings' },
  { page: 'switchAi', kind: 'pago_por_uso' },
  { page: 'generalSettings' },
]

describe('router (R19)', () => {
  it('parses back every route it builds', () => {
    for (const target of targets) expect(parseRoute(href(target))).toEqual(target)
  })

  it('accepts a trailing slash', () => {
    expect(parseRoute('/ajustes/ia/')).toEqual({ page: 'aiSettings' })
  })

  it('rejects unknown paths, steps and kinds', () => {
    for (const path of ['/otra', '/bienvenida/pagar', '/ajustes/ia/cambiar/otra', '/inicio/x', '/ajustes/ia/cambiar'])
      expect(parseRoute(path), path).toEqual({ page: 'notFound' })
  })
})

const state = (changes: Partial<OnboardingState> = {}): OnboardingState => ({
  step: 'bienvenida',
  chosenKind: null,
  postponed: false,
  revision: 0,
  completedAt: null,
  ...changes,
})

describe('onboardingRedirect (contracts/ui-screens.md)', () => {
  it('/ goes to the step of the server', () => {
    expect(onboardingRedirect({ page: 'root' }, state())).toEqual({ page: 'welcome' })
    expect(onboardingRedirect({ page: 'root' }, state({ step: 'conectar' }))).toEqual({
      page: 'wizard',
      step: 'conectar',
    })
  })

  it('another step typed by hand goes back to the real one; the real one stays', () => {
    const atConnect = state({ step: 'conectar', chosenKind: 'suscripcion' })
    expect(onboardingRedirect({ page: 'wizard', step: 'listo' }, atConnect)).toEqual({
      page: 'wizard',
      step: 'conectar',
    })
    expect(onboardingRedirect({ page: 'welcome' }, atConnect)).toEqual({ page: 'wizard', step: 'conectar' })
    expect(onboardingRedirect({ page: 'wizard', step: 'conectar' }, atConnect)).toBeNull()
    expect(onboardingRedirect({ page: 'welcome' }, state())).toBeNull()
  })

  it('postponed → /conectar-ia; completed → /inicio, also from the wizard routes', () => {
    expect(onboardingRedirect({ page: 'wizard', step: 'elegir' }, state({ postponed: true }))).toEqual({
      page: 'connectAi',
    })
    expect(onboardingRedirect({ page: 'connectAi' }, state({ postponed: true }))).toBeNull()
    const done = state({ step: 'completado', completedAt: '2026-10-29T10:00:00.000Z' })
    for (const route of [{ page: 'root' }, { page: 'welcome' }, { page: 'connectAi' }] as const)
      expect(onboardingRedirect(route, done)).toEqual({ page: 'home' })
  })

  it('home and settings are never redirected', () => {
    for (const route of [{ page: 'home' }, { page: 'aiSettings' }, { page: 'notFound' }] as const)
      expect(onboardingRedirect(route, state({ step: 'elegir' }))).toBeNull()
  })
})
