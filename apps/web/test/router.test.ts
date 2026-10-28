import { describe, expect, it } from 'vitest'
import { href, parseRoute, type Target } from '../src/router.ts'

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
