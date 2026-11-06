import { describe, expect, it } from 'vitest'
import { verdictOf } from '../../src/market/verdict.ts'

describe('verdictOf (contracts/market.md)', () => {
  it.each([
    ['baja', 'abierta', 'baja', 'no_conviene', 'demanda_baja'],
    ['alta', 'cerrada', 'baja', 'no_conviene', 'puerta_cerrada'],
    ['baja', 'cerrada', 'alta', 'no_conviene', 'demanda_baja'],
    ['alta', 'abierta', 'baja', 'conviene', 'buen_equilibrio'],
    ['media', 'abierta', 'media', 'conviene', 'buen_equilibrio'],
    ['alta', 'abierta', 'alta', 'con_reservas', 'concentracion_alta'],
    ['alta', 'entreabierta', 'baja', 'con_reservas', 'puerta_entreabierta'],
    ['media', 'entreabierta', 'alta', 'con_reservas', 'concentracion_alta'],
  ] as const)('%s, %s, %s → %s (%s)', (demandLevel, entryLevel, concentrationLevel, verdict, reason) => {
    expect(verdictOf({ demandLevel, entryLevel, concentrationLevel })).toEqual({ verdict, reason })
  })
})
