import { describe, expect, it } from 'vitest'
import { ideaVerdict } from '../../src/ideas/verdict.ts'
import { thresholds } from './thresholds.ts'

const at = (similar: number, recent = 0, medianViews: number | null = 5000, hasAudience = true) =>
  ideaVerdict({ similar, recent, medianViews, hasAudience }, thresholds)

describe('ideaVerdict (R3, in order)', () => {
  it('12 or more: a burst, worn out, or seen', () => {
    expect(at(12, 4)).toEqual({ verdict: 'quemado', reason: 'racha_reciente' })
    expect(at(12, 3, 999)).toEqual({ verdict: 'quemado', reason: 'agotado' })
    expect(at(12, 3, 1000)).toEqual({ verdict: 'competido', reason: 'muchos_con_visitas' })
    expect(at(12, 3, null)).toEqual({ verdict: 'competido', reason: 'muchos_con_visitas' })
    // The burst goes first, even worn out.
    expect(at(30, 4, 10)).toEqual({ verdict: 'quemado', reason: 'racha_reciente' })
  })
  it('5 or fewer: room with an audience, cold without', () => {
    expect(at(5, 9)).toEqual({ verdict: 'hueco', reason: 'pocos_con_publico' })
    expect(at(0, 0, null, false)).toEqual({ verdict: 'frio', reason: 'pocos_sin_publico' })
  })
  it('6 to 11: filling up with a burst; otherwise room or cold', () => {
    expect(at(6, 4)).toEqual({ verdict: 'competido', reason: 'llenandose' })
    expect(at(11, 4, 10)).toEqual({ verdict: 'competido', reason: 'llenandose' })
    expect(at(6, 3)).toEqual({ verdict: 'hueco', reason: 'sin_racha_con_publico' })
    expect(at(11, 3, 5000, false)).toEqual({ verdict: 'frio', reason: 'sin_racha_sin_publico' })
  })
})
